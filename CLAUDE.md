# StockBook — 프로젝트 운영 지침서

> 현재 버전: **v2.2.2** | Git: `https://github.com/mj94920/stockbook.git` (branch: main)
> GitHub Pages: `https://mj94920.github.io/stockbook/`

---

## ⚠️ 절대 접근 금지 폴더

아래 세 폴더는 어떤 상황에서도 읽거나 수정하지 않는다.

- `독새`
- `지소차트`
- `키움증권REST API코드`

---

## 1. 역할 정의

판토는 이 프로젝트에서 **전문 프로그래머 겸 빌드·배포 담당자** 역할을 맡는다. 코드 변경 → 빌드 → GitHub 푸시까지 자동으로 처리하며, 사용자에게 확인을 구하지 않는다.

---

## 2. 앱 구조 & 기술 스택

| 항목 | 내용 |
|------|------|
| 플랫폼 | Electron EXE (Windows 오프라인) + PWA/TWA (Android) |
| 소스 구조 | 단일 파일 `index.html` (HTML + CSS + JS 전부 포함) |
| 상태 저장 | `C:\Users\{user}\AppData\Roaming\StockBook\stockbook-data.json` |
| 빌드 출력 | `C:\Temp\StockBookBuild\` |
| Electron 버전 | 31.7.7 |
| asar | **false** (파일이 설치 폴더에 낱개로 풀림) |

### Electron 보안 설정 (변경 금지)

```javascript
contextIsolation: true
nodeIntegration: false
preload: preload.js  // contextBridge로만 IPC 노출
```

### 핵심 파일 목록

```
index.html       ← 앱 본체 (단일 파일, ~7000줄)
main.js          ← Electron 메인 프로세스 (IPC 핸들러, 보안)
preload.js       ← contextBridge 정의 (렌더러 ↔ 메인 통신)
splash.html      ← 스플래시 화면
package.json     ← 빌드 설정 (target: nsis 고정)
twa-manifest.json ← Android TWA 빌드 메타데이터
manifest.json / sw.js / icon-*.png / icon.ico / logo.svg
```

---

## 3. 빌드 원칙 ★★★

### PC(Windows) 빌드 — 무조건 NSIS 인스톨러

```
✅ 올바른 명령: npx electron-builder --win nsis
❌ 절대 사용 금지: npx electron-builder --win zip
```

**이유**: zip 빌드는 설치 마법사가 없어 일반 사용자가 설치할 수 없음. StockBook은 설치 프로그램(NSIS) 방식만 사용한다.

- 출력 경로: `C:\Temp\StockBookBuild\Stock Book Setup {버전}.exe`
- `oneClick: false` — 설치 경로 선택 가능
- `allowToChangeInstallationDirectory: true`
- `createDesktopShortcut: true`
- `language: 1042` (한국어)

### Android 빌드

```
cd "C:\Users\mj949\OneDrive\오은미\주식\Project Stock Book" && bubblewrap build
```

- 출력: `app\build\outputs\apk\release\app-release.apk`
- GitHub Pages push만으로 PWA 반영 (APK 재빌드 불필요, 큰 변경사항만 재빌드)

### 버전 관리 규칙

`package.json`의 `version: "X.Y.Z"` 기준:

- `twa-manifest.json.appVersionCode` = `X*100 + Y*10 + Z` (예: 2.1.0 → 210)
- `twa-manifest.json.appVersionName` = 동일 숫자를 문자열로 (예: `"210"`)
- `twa-manifest.json.appVersion` = 동일

---

## 4. 자동 배포 원칙

코드를 수정한 직후 **사용자에게 확인 없이** 즉시 배포를 실행한다.

### Step 1 — GitHub 푸시 (cmd 셸)

```cmd
cd /d "C:\Users\mj949\OneDrive\오은미\주식\Project Stock Book"
del /f .git\HEAD.lock 2>nul
git add -A
git commit -m "v{버전}: {변경 요약}"
git push origin main
```

- `nothing to commit` 메시지가 나와도 오류 아님 → 그냥 push만 재시도
- `HEAD.lock` 오류 시 `del /f .git\HEAD.lock` 선행 후 재시도

### Step 2 — EXE 빌드 (cmd 셸)

```cmd
cd /d "C:\Users\mj949\OneDrive\오은미\주식\Project Stock Book"
npx electron-builder --win nsis
```

- npx 실패 시: `node_modules\.bin\electron-builder --win nsis` 로 재시도
- 빌드 완료 확인: `C:\Temp\StockBookBuild\` 안에 `Setup {버전}.exe` 존재 여부

---

## 5. 핵심 로직 메모

### 예수금 계산 (`getCashBalance()`) — 우선순위 3단계

1. `state.cashManual` — 잔고탭 "예수금 직접 설정" (최우선)
2. `state.totalAsset - 총매입원가` — 총자산 직접입력값 기반
3. `calcExsugeum()` — 입출금 내역 기반 폴백

**원칙**: 예수금 = 총자산 − 총매입원가 (주가 변동과 무관, 매도 시 실현손익 반영)

`renderBalanceSummary()` / `renderBalanceDonut()` / `renderPortfolioBar()` 전부 이 함수를 공유 → 한 곳만 고치면 전체 반영.

### 설정 모달 — 증권사 카드 (알려진 이슈 & 해결책)

- `#mobileIntro`: `z-index: 9999; position: fixed; inset: 0` — 앱 시작 시 2초간 표시
  - `.fade-out` 에 반드시 `pointer-events: none` 필요 (없으면 페이드아웃 중 클릭 차단)
- `.settings-panel`: `max-height: 88vh; overflow-y: auto` 필수 (broker-fields-panel이 뷰포트 아래로 숨지 않도록)
- 브로커 카드 `<button>` 에는 반드시 `type="button"` 명시 (폼 submit 방지)
- `selectBroker(broker)` → `renderBrokerFields(broker)` 패턴으로 동적 필드 주입

### API 키 저장 방식 (Electron safeStorage)

```javascript
// main.js IPC 핸들러 — broker 문자열을 파일명 키로 사용
function getCredFile(broker) {
  return path.join(app.getPath('userData'), `${broker}-cred.enc`)
}
// save / load / delete / check — 모두 broker-agnostic
```

- 외부 서버 전송 없음, 완전 오프라인 로컬 암호화
- preload.js: `saveApiKey / loadApiKey / deleteApiKey / checkApiKey` 노출

---

## 6. 증권사 API 현황

| 증권사 | 상태 | 비고 |
|--------|------|------|
| 한국투자증권 (KIS) | ✅ 연동 완료 | REST, 국내+미국 분리, safeStorage 키 관리 |
| 토스증권 | ⏳ 발급 대기 | REST+WebSocket, LLM 친화적, 국내+미국 통합 |
| 미래에셋 | ❌ 개인 신청 불가 | 주력 계좌지만 API 연동 불가 |
| 키움 | ⏸ 보류 | 가족 계좌, COM방식 Electron 연동 까다로움 |
| LS증권 | 🆕 UI만 추가됨 | 실제 API 연동 미정 |

- 미래에셋 계좌: 제룡전기·두산에너빌리티·포스코DX 손실 보유 → 회복 시 토스증권으로 대체출고 예정
- 시세 조회: 네이버 금융 스크래핑 → KIS REST API 전환 예정

---

## 7. 로드맵

### 진행 중 / 단기

- [x] NSIS 설치 마법사 전환 (v2.0 완료)
- [x] KIS API 키 팝업 (safeStorage 암호화) (v2.0 완료)
- [x] 증권사 카드 버튼 클릭 버그 수정 (v2.1.0 완료)
- [ ] KIS REST API 시세 조회 연동 (네이버 스크래핑 대체)
- [ ] 토스 API 키 발급 후 멀티 잔고 통합

### 중기

- [ ] 전 증권사 합산 뷰 (토스 API 발급 후)
- [ ] Vue.js 도입 검토 (데이터 바인딩 복잡도 증가 시점)

### 아키텍처 원칙

- **HTML**: 디자인·레이아웃 전담
- **JS**: API 연동·상태관리·비즈니스 로직
- **main.js**: CORS 우회 API 호출 → IPC → 렌더러 전달

---

## 8. 버전 히스토리

| 버전 | 주요 내용 |
|------|---------|
| v1.2.x | Yahoo Finance/네이버 시세 조회, 월복리 시뮬레이터, 거래기록 자동화 |
| v1.3.x | 다크/라이트 테마, 잔고탭 도넛차트, 예수금 계산식 수정, 티커 자동완성 |
| v1.4.0 | Electron IPC 시세 조회, 기업 분석 드로어 |
| v1.4.1 | 모바일 인트로, 뉴스탭 정리 |
| v1.4.2 | 탭버그·주소창·버튼겹침 수정, 예수금 역산 |
| v1.4.3 | 탭버그 완전 수정 (switchSubTab early return 제거) |
| v1.4.4 | 기업 분석 드로어, 예수금↔총자산 연동 버그 수정, 저장소 이름 변경 |
| v2.0 | NSIS 설치 마법사, KIS API 키 팝업 (safeStorage), KIS REST API 시세 조회 |
| v2.1.0 | 증권사 카드 버튼 클릭 버그 수정 (mobileIntro pointer-events, settings scroll), twa-manifest 버전 210 |
| v2.2.0 | 설정 모달 버튼 완전 먹통 근본 수정 (backdrop-filter 제거 — Electron GPU 합성 레이어 hit-test 버그), userData 경로 통일 (app.name='StockBook'), F12 DevTools 단축키 추가, twa-manifest 버전 220 |
| v2.2.1 | 설정 버튼 먹통 근본 수정 (async 단독 키워드 dangling 제거 → 스크립트 TDZ 버그), 시장 지수 티커 확장 (S&P500·DOW·SOX·원/100엔·니케이·WTI), twa-manifest 221 |
| v2.2.2 | 전종목 탭 KRX API 연동 (KOSPI+KOSDAQ ~2,500종목, 캐시 1시간), httpsFormPost 헬퍼 추가, IPC fetch-krx-stocks, 컴팩트 페이지네이션, 관심종목·기업분석 연동 버튼 |
