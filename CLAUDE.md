# StockBook — 개발 지침 (Claude · 사람 공통)

> 저장소: `https://github.com/mj94920/stockbook` (branch: `main`)
> 웹/PWA: `https://mj94920.github.io/stockbook/` · 릴리스: GitHub Releases
> **현재 버전은 `package.json` 의 `version` 이 유일한 기준**이다. 문서에 버전 번호를 적지 않는다.

---

## 0. 자동화 구조 한눈에 보기

```
이슈 작성 (템플릿 → 'claude' 라벨 자동)  또는  댓글에 @claude
        │
        ▼
[claude.yml]  Claude 가 claude/* 브랜치에서 코드 수정 · npm test · 커밋
        │
        ▼
[ci.yml]      정적 검사 + 스모크 테스트 (검사 스크립트는 main 기준 고정)
        ├─ 통과 → PR 자동 생성 → main squash 머지
        └─ 실패 → Claude 1회 자동 수정 → 재검증 → 실패 시 'needs-human' PR + 이슈 알림
        │
        ▼
[release.yml] 커밋 메시지로 버전 자동 증가 → 태그 → Windows NSIS EXE · Android APK/AAB
              → GitHub Release 게시 → Pages 갱신(PWA)
```

**작업 큐** (`queue.yml`): `queue` 라벨 이슈를 번호 순서대로 **하나씩** Claude 에게 맡긴다.
진행 중 이슈는 `in-progress`, 머지되면 다음 이슈 자동 시작, 실패하면 큐 정지(`needs-human`).
여러 단계로 나뉜 큰 작업(예: UI 개편)은 이 큐로 돌린다 — 동시에 여러 Claude 가 같은 파일을 고쳐 충돌하는 것을 막는다.

사람이 main 에 직접 푸시해도 `release.yml` 이 동일하게 검사 → 배포한다.
사람이 연 PR 에 `automerge` 라벨을 붙이면 CI 통과 즉시 머지·배포된다.
**다른 에이전트(Codex/ChatGPT)** 는 `AGENTS.md` 를 읽고 `codex/*` 브랜치 → PR 로 참여한다 (머지는 사람이 `automerge` 라벨로 승인).

---

## 1. 절대 규칙

1. **접근 금지 폴더**: `독새`, `지소차트`, `키움증권REST API코드` — 읽지도 수정하지도 않는다.
2. **버전·CHANGELOG 를 직접 수정하지 않는다.** `scripts/bump-version.mjs` 가 릴리스 때 자동 처리한다
   (package.json · package-lock.json · index/mobile.html 의 `Stock Book vX.Y.Z` · sw.js 캐시명 · android/twa-manifest.json · CHANGELOG.md).
3. **커밋 메시지는 Conventional Commits + 한국어 요약.** 버전 수준이 여기서 결정된다.
   - `feat: …` → minor · `fix:/refactor:/style:/perf:/chore: …` → patch · `feat!: …` 또는 본문 `BREAKING CHANGE` → major
   - 예: `feat(watchlist): 52주 최고가 대비 하락률 열 추가`
4. **커밋 전 `npm test` 통과 필수** (정적 검사 + 스모크 테스트). `scripts/` 의 검사를 느슨하게 고쳐 통과시키지 않는다.
5. **Electron 보안 설정 변경 금지**: `contextIsolation: true`, `nodeIntegration: false`, IPC 는 `preload.js` 의 `contextBridge` 로만.
6. **Windows 빌드는 NSIS 전용** (`build.win.target: "nsis"`, `asar: false`). zip/portable 금지.
7. **비밀값 금지**: API 키·keystore·비밀번호를 코드/문서에 넣지 않는다 (GitHub Secrets 사용).
8. `.github/workflows/` 는 Claude GitHub App 권한상 수정할 수 없다 — 워크플로 변경이 필요하면 이슈에 제안만 남긴다.

---

## 2. 앱 구조

| 항목 | 내용 |
|------|------|
| 플랫폼 | Electron EXE (Windows) + PWA/TWA (Android, GitHub Pages) |
| PC 앱 | `index.html` 단일 파일 (HTML+CSS+JS, ~13,000줄) — Electron 메인 창 |
| 모바일 | `mobile.html` 단일 파일 — PWA `start_url`, TWA 가 이 페이지를 연다 |
| Electron | `main.js`(메인 프로세스·IPC·CORS 우회 fetch) / `preload.js`(contextBridge) / `splash.html` |
| PWA | `manifest.json`, `sw.js`(HTML network-first, 정적자원 cache-first) |
| 데이터 | PC: `%APPDATA%\StockBook\stockbook-data.json` / 모바일: localStorage |
| Electron 버전 | 31.7.7 |

### 파일 맵

```
index.html  mobile.html  splash.html      ← 앱 본체 (Pages 로도 서빙됨)
main.js  preload.js  installer.nsh         ← Electron / NSIS
manifest.json  sw.js  icon-*.png  icon.ico  logo.svg
android/twa-manifest.json                  ← TWA 설정 템플릿 (packageId·alias 는 CI 가 주입)
scripts/check-syntax.mjs                   ← 정적 검사   (npm run check)
scripts/smoke.mjs                          ← 스모크 테스트 (npm run smoke)
scripts/bump-version.mjs                   ← 버전 일괄 갱신 (릴리스 전용)
.github/workflows/{ci,claude,queue,release,repo-setup}.yml
docs/UI-REVAMP-PLAN.md                     ← UI/UX 1차 개편 기준 문서 (진행 중)
docs/                                      ← PRD, 과거 개발 로그
CHANGELOG.md                               ← 릴리스마다 자동 생성
```

### 변경 범위 판단

- `mobile.html` / `manifest.json` / `sw.js` 만 바꾼 경우에도 릴리스는 돌지만, 실사용 반영은 Pages 갱신이 핵심이다.
- `index.html` 은 Electron 과 Pages 양쪽에서 쓰인다. `window.electronAPI` 가 없을 때(브라우저)도 초기화가 깨지지 않아야 한다 — 스모크 테스트가 이것을 검사한다.

---

## 3. 코딩 원칙 (과거 버그에서 얻은 교훈)

- **초기화 코드에서 DOM 요소는 null 체크**: `document.getElementById(x)?.addEventListener(...)`. 없는 요소 참조 한 줄이 스크립트 전체를 멈춰 버튼 먹통을 일으켰다(v2.2.3, v2.3.1).
- **dangling `async` / TDZ 주의**: 선언 전 `let/const` 참조 금지. 스크립트 하나가 통째로 죽는다(v2.2.1).
- **Electron GPU 합성 레이어 hit-test 버그**: 모달·오버레이에 `backdrop-filter` 금지, 필요한 경우 `transform: translateZ(0)` 로 독립 레이어 승격(v2.2.0, v2.3.2, v2.3.3).
- 오버레이 페이드아웃 클래스에는 `pointer-events: none` 필수 (`#mobileIntro .fade-out`).
- 모달 안 `<button>` 은 `type="button"` 명시.
- **외부 API 는 main.js 에서 호출 → IPC → 렌더러** (CORS 회피). 렌더러 직접 fetch 는 모바일(PWA) 전용 코드에서만.
- HTML=레이아웃, JS=상태·API·로직, main.js=네트워크 브리지.

---

## 4. 핵심 로직 메모

### 예수금 `getCashBalance()` — 우선순위

1. `state.cashManual` (잔고탭 "예수금 직접 설정")
2. `state.totalAsset − 총매입원가`
3. `calcExsugeum()` (입출금 내역 폴백)

`renderBalanceSummary()` / `renderBalanceDonut()` / `renderPortfolioBar()` 가 공유 → 한 곳만 고친다.

### API 키 저장 (Electron safeStorage)

- `main.js` 의 `getCredFile(broker)` → `userData/{broker}-cred.enc`, 로컬 암호화·외부 전송 없음
- `preload.js`: `saveApiKey / loadApiKey / deleteApiKey / checkApiKey`
- KIS 토큰 캐시: `kis-token-cache.json` (하루 1회 발급), 동시 발급 방지 pending-promise 락

### 시세

- KIS REST + WebSocket(H0STCNT0) 실시간, 100ms 디바운스 렌더
- 네이버 모바일 증권 JSON (전종목·재무), Yahoo Finance (해외·지수)

---

## 5. 증권사 API 현황

| 증권사 | 상태 |
|--------|------|
| 한국투자증권 (KIS) | ✅ 연동 (REST + WebSocket) |
| 토스증권 | ⏳ 키 발급 대기 |
| LS증권 | UI 만 존재 |
| 키움 | ⏸ 보류 (COM 방식) |
| 미래에셋 | ❌ 개인 API 불가 |

---

## 6. 로드맵

- [ ] **UI/UX 1차 개편** — `docs/UI-REVAMP-PLAN.md`, 작업 큐로 진행 중
- [ ] 토스 API 연동 → 전 증권사 합산 뷰
- [ ] EXE 자동 업데이트 (electron-updater + GitHub Releases)
- [ ] `index.html` 모듈 분리 검토 (파일이 13,000줄을 넘어 유지보수 부담)

---

## 7. 로컬 개발 (선택)

```bash
npm ci
npm start          # Electron 실행
npm run test:setup # 최초 1회: 스모크 테스트용 Playwright/Chromium 설치
npm test           # 정적 검사 + 스모크 테스트
npm run dist       # 로컬 NSIS 빌드 → dist/
```

로컬 빌드·배포는 더 이상 필요 없다. main 에 들어가면 CI 가 전부 처리한다.
