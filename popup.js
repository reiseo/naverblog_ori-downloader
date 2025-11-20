// 1. 이벤트 리스너 등록
document.getElementById("scanBtn").addEventListener("click", scanImages);
document.getElementById("downloadBtn").addEventListener("click", () => downloadImages(false));
document.getElementById("zipBtn").addEventListener("click", () => downloadImages(true));
document.getElementById("selectAllBtn").addEventListener("change", toggleSelectAll);

let scannedData = [];

// 2. 스캔 시작 함수
async function scanImages() {
    const status = document.getElementById("status");
    status.textContent = "블로그 데이터 분석 중...";
    
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true }, // iframe 내부까지 탐색
        func: getBlogDataFromDOM,
    }, (results) => {
        // 권한 에러 처리
        if (chrome.runtime.lastError) {
            status.textContent = "새로고침 후 다시 시도해주세요.";
            return;
        }

        const listContainer = document.getElementById("image-list");
        listContainer.innerHTML = "";
        scannedData = [];
        const urlSet = new Set();

        // 결과 데이터 병합
        if (results && results.length > 0) {
            results.forEach((frame) => {
                if (frame.result && frame.result.images.length > 0) {
                    const { blogTitle, images } = frame.result;
                    images.forEach(imgData => {
                        // URL 중복 제거
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

        // 파일명 번호가 없는 경우 강제 부여 (안전장치)
        scannedData.forEach((item, index) => {
            if (!item.fileNumber) {
                const ext = item.originalUrl.split('.').pop().split('?')[0];
                item.finalFileName = `${item.cleanTitle} (${index + 1}).${ext}`;
            }
        });

        // 결과에 따른 UI 처리
        if (scannedData.length > 0) {
            renderList(); // 목록 그리기
            status.textContent = `총 ${scannedData.length}장 발견. 정밀 검증 시작...`;
            document.getElementById("selectAllBtn").checked = true;
            
            // ★ 핵심: 비동기 검증 시작
            verifyImagesAsync(); 
        } else {
            status.textContent = "이미지를 찾을 수 없습니다.";
        }
    });
}

// [DOM 탐색] 하이브리드 방식 (JSON우선 + 태그백업)
function getBlogDataFromDOM() {
    const titleMeta = document.querySelector('meta[property="og:title"]');
    let blogTitle = titleMeta ? titleMeta.content : document.title;
    blogTitle = blogTitle.split(':')[0].trim(); 

    const images = [];
    const processedUrls = new Set();

    // Method 1: JSON 데이터 파싱 (가장 정확함, fileSize 정보 있음)
    document.querySelectorAll('a[data-linkdata]').forEach(link => {
        try {
            const data = JSON.parse(link.getAttribute('data-linkdata'));
            if (data.src && data.linktype === 'img') {
                let originalUrl = data.src.replace("mblogthumb-phinf.pstatic.net", "blogfiles.pstatic.net").split('?')[0];
                
                if (!processedUrls.has(originalUrl)) {
                    processedUrls.add(originalUrl);
                    const srcFileName = data.src.split('/').pop();
                    const match = srcFileName.match(/\(\d+\)/);
                    
                    images.push({
                        thumbUrl: data.src,
                        originalUrl: originalUrl,
                        width: data.originalWidth, 
                        height: data.originalHeight,
                        jsonFileSize: data.fileSize ? parseInt(data.fileSize) : null, // 비교용 기준값
                        fileNumber: match ? match[0] : "",
                        sourceType: "json"
                    });
                }
            }
        } catch (e) {}
    });

    // Method 2: IMG 태그 긁어오기 (백업용, fileSize 정보 없음)
    document.querySelectorAll('img').forEach(img => {
        if (img.src && (img.src.includes("mblogthumb-phinf") || img.src.includes("blogfiles"))) {
            let originalUrl = img.src.replace("mblogthumb-phinf.pstatic.net", "blogfiles.pstatic.net").split('?')[0];
            
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

// 목록 UI 렌더링
function renderList() {
    const list = document.getElementById("image-list");
    
    scannedData.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "item";
        
        // 초기 배지 상태 설정
        let badgeContent = "정보 확인 중...";
        let badgeStyle = "color:#666; background:#eee;";

        // JSON 데이터가 미리 있다면 먼저 보여줌
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
                    <span class="res-badge" id="badge-${index}" style="${badgeStyle}">
                        ${badgeContent}
                    </span>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

// ★ 정밀 검증 로직 (서버 헤더 vs JSON 데이터 비교)
async function verifyImagesAsync() {
    const status = document.getElementById("status");

    for (let i = 0; i < scannedData.length; i++) {
        const item = scannedData[i];
        
        try {
            // 1. 실제 파일 헤더 조회 (HEAD Request)
            const response = await fetch(item.originalUrl, { method: 'HEAD' });
            const netSize = parseInt(response.headers.get("Content-Length"));
            item.realFileSize = netSize; // 실제 사이즈 저장
            
            // 2. 해상도 확인 (이미지 로딩)
            // (JSON에 해상도가 없으면 직접 로딩해서 채움)
            if (!item.width) {
                await new Promise(resolve => {
                    const img = new Image();
                    img.src = item.originalUrl;
                    img.onload = function() {
                        item.width = this.naturalWidth;
                        item.height = this.naturalHeight;
                        resolve();
                    };
                    img.onerror = resolve;
                });
            }
        } catch (e) {
            console.error("Verify Error:", e);
        }

        // 3. 배지 업데이트 (결과 반영)
        updateBadge(i, item);
    }
    status.textContent = "모든 이미지 검증 완료!";
}

// 배지 상태 업데이트 함수
function updateBadge(index, item) {
    const badge = document.getElementById(`badge-${index}`);
    if (!badge) return;

    // 용량 텍스트
    const sizeVal = item.realFileSize || item.jsonFileSize;
    const sizeText = sizeVal ? `${(sizeVal / 1024 / 1024).toFixed(2)}MB` : "용량불명";
    
    // 해상도 텍스트
    const resText = item.width ? `${item.width}x${item.height}` : "해상도불명";

    let verifyMark = "";
    let style = "color:#1967d2; background:#e8f0fe; border:1px solid #d2e3fc;"; // 기본 파랑

    // Case A: JSON 정보와 실제 용량이 정확히 일치 (완벽)
    if (item.jsonFileSize && item.realFileSize && item.jsonFileSize === item.realFileSize) {
        verifyMark = `<span style='color:#03c75a; font-weight:bold;'>✔ 일치</span>`; 
    } 
    // Case B: JSON은 없지만 실제 용량은 확인함 (정상)
    else if (!item.jsonFileSize && item.realFileSize) {
        verifyMark = `<span>✔ 확인</span>`; 
    }
    // Case C: 둘 다 있는데 서로 다름 (경고)
    else if (item.jsonFileSize && item.realFileSize && item.jsonFileSize !== item.realFileSize) {
        style = "color:#d93025; background:#fce8e6; border:1px solid #fad2cf;"; // 빨강
        verifyMark = `<span>⚠ 불일치</span>`;
    }

    badge.innerHTML = `원본: ${resText} | ${sizeText} ${verifyMark}`;
    badge.style.cssText = style;
}

// 전체 선택/해제
function toggleSelectAll() {
    const isChecked = document.getElementById("selectAllBtn").checked;
    document.querySelectorAll("#image-list input[type='checkbox']").forEach(cb => cb.checked = isChecked);
}

// 다운로드 (ZIP / 개별)
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
        
        if (count === 0) {
            alert("다운로드 권한 오류. manifest.json 설정을 확인하세요.");
            return;
        }

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