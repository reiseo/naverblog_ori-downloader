// 1. 이벤트 리스너
document.getElementById("scanBtn").addEventListener("click", scanImages);
document.getElementById("downloadBtn").addEventListener("click", () => downloadImages(false));
document.getElementById("zipBtn").addEventListener("click", () => downloadImages(true));
document.getElementById("selectAllBtn").addEventListener("change", toggleSelectAll);

let scannedData = [];

// 2. 스캔 시작
async function scanImages() {
    const status = document.getElementById("status");
    status.textContent = "블로그 분석 중... (PC/Mobile)";
    
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: getBlogDataFromDOM,
    }, (results) => {
        if (chrome.runtime.lastError) {
            status.textContent = "새로고침 후 다시 시도해주세요.";
            return;
        }

        const listContainer = document.getElementById("image-list");
        listContainer.innerHTML = "";
        scannedData = [];
        const urlSet = new Set();

        if (results && results.length > 0) {
            results.forEach((frame) => {
                if (frame.result && frame.result.images.length > 0) {
                    const { blogTitle, images } = frame.result;
                    images.forEach(imgData => {
                        if (!urlSet.has(imgData.originalUrl)) {
                            urlSet.add(imgData.originalUrl);
                            
                            const cleanTitle = (blogTitle || "image").replace(/[\\/:*?"<>|]/g, "").trim();
                            const ext = imgData.originalUrl.split('.').pop().split('?')[0];
                            const finalFileName = `${cleanTitle} ${imgData.fileNumber}.${ext}`;

                            scannedData.push({
                                ...imgData,
                                finalFileName: finalFileName,
                                cleanTitle: cleanTitle
                            });
                        }
                    });
                }
            });
        }

        // 번호 없는 파일 보정
        scannedData.forEach((item, index) => {
            if (!item.fileNumber) {
                const ext = item.originalUrl.split('.').pop().split('?')[0];
                item.finalFileName = `${item.cleanTitle} (${index + 1}).${ext}`;
            }
        });

        if (scannedData.length > 0) {
            renderList();
            status.textContent = `총 ${scannedData.length}장 발견. 정밀 검증 시작...`;
            document.getElementById("selectAllBtn").checked = true;
            verifyImagesAsync(); 
        } else {
            status.textContent = "이미지를 찾을 수 없습니다.";
        }
    });
}

// [핵심 수정] DOM 탐색 함수
function getBlogDataFromDOM() {
    const titleMeta = document.querySelector('meta[property="og:title"]');
    let blogTitle = titleMeta ? titleMeta.content : document.title;
    blogTitle = blogTitle.split(':')[0].trim(); 

    const images = [];
    const processedUrls = new Set();

    // 공통 변환 함수 (mblogthumb 또는 postfiles -> blogfiles)
    // 정규식 설명: /(A|B)\.pstatic\.net/ -> A.pstatic.net 이나 B.pstatic.net을 찾음
    function convertToOriginal(url) {
        return url.replace(/(mblogthumb-phinf|postfiles)\.pstatic\.net/, "blogfiles.pstatic.net").split('?')[0];
    }

    // Method 1: JSON (Smart Editor 3.0)
    document.querySelectorAll('a[data-linkdata]').forEach(link => {
        try {
            const data = JSON.parse(link.getAttribute('data-linkdata'));
            if (data.src && data.linktype === 'img') {
                
                // ★ 수정된 부분: 변환 함수 사용
                let originalUrl = convertToOriginal(data.src);
                
                if (!processedUrls.has(originalUrl)) {
                    processedUrls.add(originalUrl);
                    const srcFileName = data.src.split('/').pop();
                    const match = srcFileName.match(/\(\d+\)/);
                    
                    images.push({
                        thumbUrl: data.src,
                        originalUrl: originalUrl,
                        width: data.originalWidth, 
                        height: data.originalHeight,
                        jsonFileSize: data.fileSize ? parseInt(data.fileSize) : null,
                        fileNumber: match ? match[0] : "",
                        sourceType: "json"
                    });
                }
            }
        } catch (e) {}
    });

    // Method 2: IMG Tag (Backup)
    document.querySelectorAll('img').forEach(img => {
        // ★ 수정된 부분: mblogthumb 또는 postfiles 또는 blogfiles 포함 여부 확인
        if (img.src && (img.src.includes("mblogthumb-phinf") || img.src.includes("postfiles") || img.src.includes("blogfiles"))) {
            
            // ★ 수정된 부분: 변환 함수 사용
            let originalUrl = convertToOriginal(img.src);
            
            if (!processedUrls.has(originalUrl)) {
                processedUrls.add(originalUrl);
                const srcFileName = img.src.split('/').pop();
                const match = srcFileName.match(/\(\d+\)/);

                images.push({
                    thumbUrl: img.src,
                    originalUrl: originalUrl,
                    width: null, height: null, jsonFileSize: null,
                    fileNumber: match ? match[0] : "",
                    sourceType: "tag"
                });
            }
        }
    });

    return { blogTitle, images };
}

// (아래 renderList, verifyImagesAsync, updateBadge, toggleSelectAll, downloadImages 함수는 
//  직전에 드린 '최종 완성본' 코드와 완전히 동일합니다. 그대로 유지하시면 됩니다.)

function renderList() {
    const list = document.getElementById("image-list");
    scannedData.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "item";
        let badgeContent = "정보 확인 중...";
        let badgeStyle = "color:#666; background:#eee;";
        if (item.jsonFileSize) {
             const sizeMb = (item.jsonFileSize / 1024 / 1024).toFixed(2);
             badgeContent = `메타정보: ${sizeMb}MB (검증 대기)`;
        }
        div.innerHTML = `
            <input type="checkbox" checked data-idx="${index}">
            <img src="${item.thumbUrl}">
            <div class="info">
                <span class="filename" title="${item.finalFileName}">${item.finalFileName}</span>
                <div class="meta-info">
                    <span class="res-badge" id="badge-${index}" style="${badgeStyle}">${badgeContent}</span>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

async function verifyImagesAsync() {
    const status = document.getElementById("status");
    for (let i = 0; i < scannedData.length; i++) {
        const item = scannedData[i];
        try {
            const response = await fetch(item.originalUrl, { method: 'HEAD' });
            const netSize = parseInt(response.headers.get("Content-Length"));
            item.realFileSize = netSize; 
            if (!item.width) {
                await new Promise(resolve => {
                    const img = new Image();
                    img.src = item.originalUrl;
                    img.onload = function() { item.width = this.naturalWidth; item.height = this.naturalHeight; resolve(); };
                    img.onerror = resolve;
                });
            }
        } catch (e) {}
        updateBadge(i, item);
    }
    status.textContent = "모든 이미지 검증 완료!";
}

function updateBadge(index, item) {
    const badge = document.getElementById(`badge-${index}`);
    if (!badge) return;
    const sizeVal = item.realFileSize || item.jsonFileSize;
    const sizeText = sizeVal ? `${(sizeVal / 1024 / 1024).toFixed(2)}MB` : "용량불명";
    const resText = item.width ? `${item.width}x${item.height}` : "해상도불명";
    let verifyMark = "";
    let style = "color:#1967d2; background:#e8f0fe; border:1px solid #d2e3fc;"; 
    if (item.jsonFileSize && item.realFileSize && item.jsonFileSize === item.realFileSize) {
        verifyMark = `<span style='color:#03c75a; font-weight:bold;'>✔ 일치</span>`; 
    } else if (!item.jsonFileSize && item.realFileSize) {
        verifyMark = `<span>✔ 확인</span>`; 
    } else if (item.jsonFileSize && item.realFileSize && item.jsonFileSize !== item.realFileSize) {
        style = "color:#d93025; background:#fce8e6; border:1px solid #fad2cf;"; 
        verifyMark = `<span>⚠ 불일치</span>`;
    }
    badge.innerHTML = `원본: ${resText} | ${sizeText} ${verifyMark}`;
    badge.style.cssText = style;
}

function toggleSelectAll() {
    const isChecked = document.getElementById("selectAllBtn").checked;
    document.querySelectorAll("#image-list input[type='checkbox']").forEach(cb => cb.checked = isChecked);
}

async function downloadImages(isZip) {
    const checkboxes = document.querySelectorAll("#image-list input:checked");
    if (checkboxes.length === 0) { alert("선택된 이미지가 없습니다."); return; }
    const status = document.getElementById("status");
    status.textContent = "다운로드 시작...";
    if (isZip) {
        const zip = new JSZip();
        let count = 0;
        for (const cb of checkboxes) {
            const idx = cb.getAttribute("data-idx");
            const item = scannedData[idx];
            status.textContent = `다운로드 중... (${count + 1}/${checkboxes.length})`;
            try {
                const response = await fetch(item.originalUrl);
                const blob = await response.blob();
                zip.file(item.finalFileName, blob);
                count++;
            } catch (err) {}
        }
        if (count === 0) { alert("다운로드 권한 오류."); return; }
        status.textContent = "압축 파일 생성 중...";
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${scannedData[0].cleanTitle || "images"}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        status.textContent = "완료!";
    } else {
        checkboxes.forEach((cb) => {
            const idx = cb.getAttribute("data-idx");
            const item = scannedData[idx];
            chrome.downloads.download({ url: item.originalUrl, filename: `naver_blog/${item.finalFileName}` });
        });
        status.textContent = "개별 다운로드 요청 완료";
    }
}
