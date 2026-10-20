# 작성자 검증 결과

2026-10-20 · 시스템룸은 아직 이 코드 전달본을 검수하지 않았다. PR #76의 디자인 검증 기록과 이번 코드 검증을 혼동하지 않는다.

## 통과

- `node --check app.js`, `node --check news-data.js`.
- Python Playwright + 시스템 Chromium: 홈 카드 6개와 순서, 판정 근거 열기, 기사 5건 최신순, 원문 새 창/rel, 공시 3건과 가상 원문 안내.
- 필터: 선택 초안과 적용 분리, 전체/단독/0개, 빈 결과 복구, 공시 왕복·홈 왕복·브라우저 뒤로가기 후 선택 유지.
- 가상 예시/미연결/로딩/오류/실제 결과 없음 상태 분리. 미수신을 0원으로 대체하지 않음.
- 320/360/390px와 자체 글자 배율 100%/200%에서 문서 가로 넘침 없음.
- 안내 토스트가 하단 도구 클릭을 가로막는 문제를 검사에서 발견해 pointer-events:none으로 수정하고 재검사 통과.
- 브라우저 pageerror 0. 자동 외부 요청 0(CSP connect-src:none, 내장 사진, 로컬 SVG). 외부 원문 링크는 클릭하지 않고 속성만 검사.
- main 77c7497의 필요한 PC 파일을 GitHub 연결 도구로 복원한 격리 스냅샷에서 변경하지 않은 `npm test`(정적 검사+기존 PC smoke) 통과. 저장소 전체 clone이나 npm ci를 완료한 것으로 주장하지 않음. 기존 환경 Playwright와 시스템 Chromium을 사용했고, 로컬 PLAYWRIGHT_BROWSERS_PATH로 바이너리 경로만 지정. 검사 스크립트와 package.json을 수정하지 않음.

## 한계·미수행

- 200%는 프로토타입 자체 글자 배율이며 Android 시스템 폰트/실기기/스크린리더 검증이 아니다. 스크린샷의 모든 요소에 대한 픽셀 일치·모든 버튼 겹침 자동 검증을 주장하지 않는다.
- 일지 입력/저장/재개는 미구현이므로 입력 보존 테스트 대상이 아니다. 최신 거래/거래상세 브라우저 검증은 대조표의 후속 과제다.
- 뉴스·이미지·원문 정책, 실제 Provider/장부/규칙 엔진/저장/인증/분류 계약은 검증하지 않음. 예시는 실데이터가 아니다.
- dark mode, Android Studio/Kotlin, Windows 빌드, Shared Contract 확정은 이번 범위 밖.
- 셸 git은 proxy:8080 연결 실패. 연결 도구로 고정 main 파일만 가져왔고 접근 금지 디렉터리는 읽지 않았다.

## 실행 재현

`python check.py` (Python Playwright 설치 및 Chromium 필요). 시스템 Chromium 경로가 다르면 `CHROMIUM_EXECUTABLE` 환경변수 지정. 테스트는 로컬 127.0.0.1 임시 포트만 사용한다. 이 실행 환경에서는 로컬 서버/Chromium 실행에 sandbox network 추가 권한이 필요했다. 검토 산출물은 home-390.png/news-390.png/news-360-large.png로 로컬 생성되며 중복 바이너리를 PR에 추가하지 않는다.
