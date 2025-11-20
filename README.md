# 네이버 블로그 원본 다운로더 - 크롬 확장프로그램 (Naver Blog Image Downloader - Chrome Extend)

Development Support: Gemini 3.0


네이버 블로그에 게시된 이미지를 원본 해상도로 추출하고, 실제 파일 용량을 검증하여 다운로드하는 크롬(크로미움 호환) 확장 프로그램입니다. 

개별 다운로드 및 ZIP 압축 다운로드를 지원합니다.


<img width="1127" height="900" alt="image" src="https://github.com/user-attachments/assets/32315c2b-f5af-493c-83db-2d522dbf6d2a" />


## 주요 기능

* **하이브리드 스캔 (Hybrid Scanning)**
    * Smart Editor 3.0의 JSON 메타데이터(`data-linkdata`)를 우선 분석하여 정확한 정보를 가져옵니다.
    * 구형 에디터 호환을 위해 `<img>` 태그 백업 스캔 방식도 함께 지원합니다.

* **정밀 교차 검증 (Double Verification)**
    * **용량 검증:** 네이버 서버에 기록된 용량(JSON)과 실제 파일의 헤더(HTTP Header) 용량을 비교합니다.
    * **해상도 검증:** 이미지를 가상 로딩하여 실제 `original Width/Height`를 체크합니다.
    * **상태 표시:** 일치(✔ Green), 확인됨(✔ Blue), 불일치(⚠ Red)로 시각화하여 보여줍니다.

* **ZIP 일괄 다운로드**
    * `JSZip` 라이브러리를 활용하여 선택한 이미지들을 하나의 압축 파일로 다운로드합니다.
    * 파일 권한(`host_permissions`)을 사용하여 `fetch` 방식으로 데이터를 안전하게 수집합니다.

* **스마트 파일명 지정**
    * `블로그 제목 + (번호).확장자` 형식으로 파일을 자동 정리하여 저장합니다.





## 설치 방법

이 프로젝트는 크롬 웹 스토어에 등록되지 않았으므로 **개발자 모드**를 통해 설치해야 합니다.

<img width="1918" height="887" alt="image" src="https://github.com/user-attachments/assets/72e5e503-d67c-44aa-b5e1-f274820be730" />

1.  Releases에서 최신 버전의 ZIP 파일을 다운로드하여 압축을 풉니다.
2.  크롬 브라우저 주소창에 `chrome://extensions/`를 입력합니다.
3.  우측 상단 **'개발자 모드'** 스위치를 켭니다.
4.  좌측 상단 **'압축해제된 확장 프로그램을 로드'** 버튼을 클릭합니다.
5.  다운로드 받은 폴더를 선택하면 설치가 완료됩니다.



## 사용 방법

<img width="1661" height="847" alt="image" src="https://github.com/user-attachments/assets/475a59c5-107f-4e20-8a25-1206fb40eeb9" />


1.  이미지를 다운로드하고 싶은 **네이버 블로그 게시물**에 접속합니다.
2.  브라우저 우측 상단의 확장 프로그램 아이콘(퍼즐 모양)을 클릭하여 앱을 실행합니다.
3.  **'스캔하기'** 버튼을 누릅니다.
4.  이미지 목록과 원본 해상도, 용량 검증 결과(✔)를 확인합니다.
5.  원하는 이미지를 체크한 후 **'개별 다운'** 또는 **'ZIP 압축 다운'**을 클릭합니다.



## 기술 스택

* **Chrome Extension Manifest V3**
* **HTML5 / CSS3**
* **Vanilla JavaScript (ES6+)** - No Framework
* **[JSZip](https://stuk.github.io/jszip/)** - For creating .zip files



## 프로젝트 구조

```text
naverblog_ori-downloader_v1.2.3/
├── manifest.json    # 설정 파일
├── popup.html       # 확장 프로그램 화면
├── popup.js         # 로직
├── icon.png         # 아이콘 파일
└── jszip.min.js     # 압축 라이브러리
