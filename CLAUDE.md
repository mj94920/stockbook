# StockBook — 개발 지침 (Claude · 사람 공통)

> 저장소: `https://github.com/mj94920/stockbook` (branch: `main`)
> 웹: `https://mj94920.github.io/stockbook/` · 릴리스: GitHub Releases
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
[ci.yml]      정적 검사 + 스모크 테스트 (검사 스크립트는 main 기준 고정, 'tests-approved' 라벨 PR 은 PR 기준)
        ├─ 통과 → PR 자동 생성 → main 동기화(sync-main.sh) → main squash 머지
        │         (릴리스 버전 문자열 충돌은 자동 해결, 그 외 충돌·머지 실패는 'needs-human' + 알림)
        └─ 실패 → Claude 1회 자동 수정 → 재검증 → 실패 시 'needs-human' PR + 이슈 알림
        │
        ▼
[release.yml] 커밋 메시지로 버전 자동 증가 → 태그 → Windows NSIS EXE
              → GitHub Release 게시 → Pages 갱신(웹)
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
   (package.json · package-lock.json · index.html 의 `Stock Book vX.Y.Z` · CHANGELOG.md).
3. **커밋 메시지는 Conventional Commits + 한국어 요약.** 버전 수준이 여기서 결정된다.
   - `feat: …` → minor · `fix:/refactor:/style:/perf:/chore: …` → patch · `feat!: …` 또는 본문 `BREAKING CHANGE` → major
   - 예: `feat(watchlist): 52주 최고가 대비 하락률 열 추가`
4. **커밋 전 `npm test` 통과 필수** (정적 검사 + 스모크 테스트). `scripts/` 의 검사를 느슨하게 고쳐 통과시키지 않는다.
5. **Electron 보안 설정 변경 금지**: `contextIsolation: true`, `nodeIntegration: false`, IPC 는 `preload.js` 의 `contextBridge` 로만.
6. **Windows 빌드는 NSIS 전용** (`build.win.target: "nsis"`, `asar: false`). zip/portable 금지.
7. **비밀값 금지**: API 키·keystore·비밀번호를 코드/문서에 넣지 않는다 (GitHub Secrets 사용).
8. **작업 큐/Actions 안의 Claude 는 `.github/workflows/` 를 수정할 수 없다** (`GITHUB_TOKEN` 은 워크플로 파일을 푸시할 수 없음).
   워크플로 변경이 필요하면 이슈에 제안을 남기고, 사람이 승인한 세션에서 별도 PR 로 반영한다.
9. **검사(`scripts/`)를 바꿔야 하는 PR** (화면 구조 변경·파일 삭제 등): CI 는 claude/*·codex/* 브랜치를 main 의 검사로 돌리므로 실패한다.
   PR 에 바뀐 검사가 느슨해지지 않았음을 적고, 사람이 검토 후 `tests-approved` 라벨을 붙이면 PR 브랜치의 검사로 CI 가 돈다.

---

## 2. 앱 구조

| 항목 | 내용 |
|------|------|
| 플랫폼 | Electron EXE (Windows) + 웹 브라우저 (GitHub Pages). Legacy 모바일(Android TWA·PWA)은 2026-10 폐기. **StockBook Android 2.0(Kotlin)** 은 신규 클라이언트로 §8 에 따라 개발 |
| PC 앱 | `index.html` 단일 파일 (HTML+CSS+JS, ~13,000줄) — Electron 메인 창 |
| Electron | `main.js`(메인 프로세스·IPC·CORS 우회 fetch) / `preload.js`(contextBridge) / `splash.html` |
| 데이터 | PC: `%APPDATA%\StockBook\stockbook-data.json` / 웹: localStorage |
| Electron 버전 | 31.7.7 |

### 파일 맵

```
index.html  splash.html                  ← 앱 본체 (index.html 은 Pages 로도 서빙됨)
main.js  preload.js  installer.nsh         ← Electron / NSIS
icon-*.png  icon.ico                     ← 앱 아이콘 (파란 책 + 상승 차트)
scripts/check-syntax.mjs                   ← 정적 검사   (npm run check)
scripts/smoke.mjs                          ← 스모크 테스트 (npm run smoke)
scripts/bump-version.mjs                   ← 버전 일괄 갱신 (릴리스 전용)
.github/scripts/{ship-branch,sync-main,pr-scope}.sh ← Claude 브랜치 PR·main 동기화·머지, PR 변경 범위 판정 (워크플로가 호출)
.github/workflows/{ci,claude,queue,release,repo-setup,android-ci}.yml
docs/UI-REVAMP-PLAN.md                     ← UI/UX 1차 개편 기준 문서 (진행 중)
docs/STRUCTURE-REVAMP-PLAN.md              ← 2차 구조 개편 작업 지시서 (#29 → #47 → … → #50, 에픽 #46)
docs/SQLITE-STORAGE-DESIGN.md              ← #29 SQLite 저장 구조 설계 (승인)
docs/                                      ← PRD, 과거 개발 로그
CHANGELOG.md                               ← 릴리스마다 자동 생성
```

### 변경 범위 판단

- `index.html` 은 Electron 과 Pages 양쪽에서 쓰인다. `window.electronAPI` 가 없을 때(브라우저)도 초기화가 깨지지 않아야 한다 — 스모크 테스트가 이것을 검사한다.

---

## 3. 코딩 원칙 (과거 버그에서 얻은 교훈)

- **초기화 코드에서 DOM 요소는 null 체크**: `document.getElementById(x)?.addEventListener(...)`. 없는 요소 참조 한 줄이 스크립트 전체를 멈춰 버튼 먹통을 일으켰다(v2.2.3, v2.3.1).
- **dangling `async` / TDZ 주의**: 선언 전 `let/const` 참조 금지. 스크립트 하나가 통째로 죽는다(v2.2.1).
- **Electron GPU 합성 레이어 hit-test 버그**: 모달·오버레이에 `backdrop-filter` 금지, 필요한 경우 `transform: translateZ(0)` 로 독립 레이어 승격(v2.2.0, v2.3.2, v2.3.3).
- 오버레이 페이드아웃 클래스에는 `pointer-events: none` 필수 (`#mobileIntro .fade-out` — 이름과 달리 Electron 시작 인트로).
- **Legacy 모바일(PWA/TWA)은 폐기 상태를 유지한다.** `mobile.html`·루트 `manifest.json`·`sw.js`·Legacy TWA(`twa-manifest.json`, Bubblewrap 산출물)를 복원하거나 다시 만들지 않는다 (2026-10 폐기 결정).
- StockBook Android 2.0 은 위 Legacy 의 복구가 아니다. 개발 범위와 규칙은 §8 을 따른다.
- 모달 안 `<button>` 은 `type="button"` 명시.
- **외부 API 는 main.js 에서 호출 → IPC → 렌더러** (CORS 회피). 렌더러 직접 fetch 는 브라우저(Pages) 폴백 코드에서만.
- HTML=레이아웃, JS=상태·API·로직, main.js=네트워크 브리지.
- **새 도메인 로직(종목 ID·Provider·타임라인·규칙 등)은 `index.html` 에 쓰지 않고 `src/` 아래 별도 파일로 만든다** (`docs/STRUCTURE-REVAMP-PLAN.md` §11). 종목 간 관계는 `assetId` 로만 건다 — 종목명은 표시값이다.
- **UI 는 디자인 토큰(`--sb-*`)과 공통 컴포넌트(`.sb-btn/.sb-input/.sb-modal/.sb-stat`)만 사용**한다. 새 하드코딩 색상 금지 (`docs/UI-REVAMP-PLAN.md` §8).
- 새 팝업은 `.sb-modal--s/m/l` 규격(head/body/foot, 닫기 버튼)으로 만든다. 설정 항목은 설정 허브(`#settingsModal`, `settingsGo(cat)`) 카테고리에 추가한다.
- 사이드바 메뉴는 `.mdi-sb-btn[data-pid]` ↔ `#mdi-panel-{pid}[data-mdi-state]`, 시장 일정은 `#calPanel` — 스모크 테스트가 이 id 들에 의존하므로 바꾸면 `scripts/smoke.mjs` 도 함께 고친다.

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

- [x] **UI/UX 1차 개편** — 완료 (결과: `docs/UI-REVAMP-PLAN.md` §9)
- [ ] 토스 API 연동 → 전 증권사 합산 뷰
- [ ] EXE 자동 업데이트 (electron-updater + GitHub Releases)
- [ ] **2차 구조 개편** — `docs/STRUCTURE-REVAMP-PLAN.md`. UI 2차(#36–#40) 완료 후 #29 부터 `queue`
- [ ] `index.html` 모듈 분리 — 2차 구조 개편의 새 코드(`src/`)부터 단계적으로
- [ ] StockBook Android 2.0 — §8 의 게이트 순서대로 (#29 → #47 → Contract → Provider/Engine → PC 기반 완성선 → Android)

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

---

## 8. StockBook Android 2.0 (신규 · Kotlin)

> 기획: Notion `Stock Book Android 2.0 — 모바일 전용 기획 메모 (2026-10-09)`. 아래는 저장소 규칙이며, 기획과 다르면 이 절이 아니라 기획을 먼저 갱신한다.

### 8-1. 정의

- Android 2.0 은 **Kotlin 기반 신규 클라이언트**다. Legacy PWA/TWA 의 복구가 아니며, **PC UI 코드(`index.html` 등)를 재사용하지 않는다.**
- PC 와 Android 가 공유하는 것은 `shared/` 의 **데이터 규격(schemas) · 테스트 정답(fixtures) · 판정 정의(docs)** 뿐이다.
  계산 코드(JS/Kotlin)·UI·네트워크/저장소 구현은 공유하지 않는다.
- 위치는 이 저장소의 `android/`. 별도 저장소로 분리하지 않는다 (같은 `shared/` 파일을 양쪽이 검증하기 위해).

### 8-2. 착수 순서 (게이트)

아래 순서를 건너뛰지 않는다. **Android Gate(= PC 기반 완성선) 통과 전에는 `android/` 를 만들지 않는다.**

```
Phase 0    현황 조사 (완료)
Phase 0.5  정책 변경 (#54 완료) → 후속 정책 PR (release · CI · .gitignore · 문서 정합)
#29  SQLite 저장구조 기반
#47  Asset / 고유 식별자 (name → assetId, 외부 식별자 stockCode)
━━━━ Contract Gate ━━━━   #29 · #47 의 완료 조건 충족 전에는 Shared Contract 를 확정하지 않는다
Contract 핵심 결정  통화 · 정밀도/반올림 · changeRate 단위 · timestamp/priceType · 데이터 부족 처리 · Event 중복 방지
Shared Contract    schemas · fixtures · docs
#48 Market Data Provider 분리 → #49 시계열(DailyCandle) → #50 규칙 엔진 (Indicator / Signal)
JS Fixture Test PASS
━━━━ Android Gate ━━━━   조건: #48 ~ #50 완료 + JS Fixture Test PASS
Android 2.0 프로젝트 생성 → Kotlin 구현 → Kotlin Fixture Test PASS → Android UI
```

- 자동 개발(Claude/Codex)은 이 절의 **현재 단계에 해당하는 이슈만** 처리한다. 뒤 단계 이슈를 미리 구현하지 않는다.
- #29 착수 조건: UI 2차(#36–#40) 완료. #47 은 #29 의 백업·검증·롤백 체계를 재사용하며 JSON 위에 별도 마이그레이션을 만들지 않는다. 세부는 `docs/STRUCTURE-REVAMP-PLAN.md`.
- **#49(시계열 저장)는 #29(SQLite)에 의존한다.** #48 ~ #52 는 2차 기획의 기존 의존관계를 그대로 따른다.
- **#51(종목 타임라인) · #52(매수 근거 ↔ 결과)는 Android Gate 밖이다.** Android 가 의존하지 않으므로 게이트 통과 여부와 무관하게 별도로 진행한다.
- Asset·SQLite·DailyCandle·Indicator/Signal Engine 은 **Android 전용이 아니라 StockBook 자체의 2차 개편 과제**다. Android 는 그 결과를 쓰는 두 번째 클라이언트다.
  이슈·PR 에는 "Android 때문에 필요한 것"과 "StockBook 자체 개편"을 구분해 적는다.

### 8-3. 규칙

1. `shared/` 는 데이터 규격 · fixture · 규칙 문서만 둔다. 실행 코드(JS/Kotlin)를 넣지 않는다.
2. **Contract 를 먼저 고치고 구현을 맞춘다.** 한 플랫폼 구현만 바꿔 fixture 결과가 달라지게 하지 않는다. 계약 변경은 양쪽 테스트를 함께 갱신한다.
3. Contract 는 기존 식별 체계(종목명 연결)를 굳히지 않는다 (#47 선행). 식별자의 역할은 둘로 나뉜다.
   - **`assetId`** = StockBook 내부의 **불변 영속 ID** (UUID 계열 opaque 값). **내부 관계(보유·거래·일지·관심·메모)는 `assetId` 만 사용**한다.
     최초 마이그레이션에서 발급하고 `(market, stockCode) ↔ assetId` 매핑을 보존한다. 해시 등으로 재계산하지 않으며 발급 후 바뀌지 않는다.
   - **`stockCode`(+`market`)** = 시장에서 쓰는 **외부 식별자**. 시장 데이터 매핑용 속성이며 관계 키가 아니다. 코드·심볼이 바뀌어도 `assetId` 는 유지한다.
4. 금액에는 `currency` 를 붙인다. 통화별 최소단위/정밀도는 `shared/docs/DATA_CONTRACT.md` 가 정한다. **서로 다른 통화의 금액을 단순 합산하지 않는다.**
5. Android 는 네이버/Yahoo 를 직접 호출하지 않는다. 일봉·기준정보는 `data` 브랜치 일일 JSON(#31), 장중 Snapshot 은 별도 Provider 로 분리한다. 초기판은 장중 실시간성을 포함하지 않는다.
6. 계산 가능한 판정(이동평균·상태·사건·신호)은 코드가 한다. AI 에 차트 이미지를 읽혀 판정하지 않는다.
7. API 키·keystore·서명 키를 저장소에 넣지 않는다 (§1-7). Android 앱에 증권사 API 키를 내장하지 않는다.
8. Android 코드는 `android/` 아래에만 둔다. PC 코드(`index.html`·`main.js`·`preload.js`)에서 Android 를 참조하지 않는다.
9. **CI/Release 는 Windows 와 완전히 분리**한다. Android 워크플로는 `android-*.yml` 로 따로 두고, Android 변경이 Windows 릴리스를 만들지 않으며 그 반대도 같다. 워크플로 변경은 사람이 PR 로 반영한다 (§1-8).
   - `release.yml` 은 `android/**` 변경만으로는 실행되지 않는다. `ci.yml` 은 `android/` 만 바꾸는 PR 의 Windows 검사를 건너뛰고, Android 검사는 `android-ci.yml` 이 맡는다.
   - 변경 파일 판정은 `.github/scripts/pr-scope.sh`(GitHub API, 이름 변경의 이전 경로 포함)가 한다. **판정에 실패하면 Windows 검사는 건너뛰지 않고 자동 머지는 하지 않는다.**
   - `android-ci.yml` 은 `android/` 프로젝트가 생기기 전에는 아무 것도 실행하지 않는다 (gate 잡이 건너뜀).
10. **Android 관련 PR 에는 `automerge` 라벨을 부여하지 않는다.** Android CI 가 필수 상태 검사로 등록되고 검증되기 전까지 모든 Android PR 은 사람의 검토와 머지를 거친다.
    - 문서 규칙만으로는 막을 수 없으므로 자동 머지 경로 두 곳에 같은 가드를 둔다: `ci.yml` 의 `automerge` 잡, Claude 작업 브랜치를 머지하는 `.github/scripts/ship-branch.sh`.
      두 곳 모두 `pr-scope.sh` 의 `android=false`(android/ 를 건드리지 않음이 **확인된** 경우)일 때만 자동 머지하고, Android 포함(`true`)과 판정 실패(`unknown`)는 모두 보류한다.
      `ci.yml` 은 보류한 PR 의 `automerge` 라벨을 떼고 이유를 코멘트한다 (`automerge-blocked` 잡).
    - 판정은 **머지할 커밋(HEAD SHA) 기준**이다. `ship-branch.sh` 는 머지 직전에 sha 를 확정해 판정하고, 그 사이 브랜치가 움직였으면 보류하며, 머지는 `--match-head-commit` 으로 같은 sha 일 때만 성립시킨다.
      `ci.yml` 은 실행이 검사한 커밋과 PR 의 현재 HEAD 가 같을 때만 판정한다.
    - 가드 스크립트(`.github/scripts/`)는 PR 브랜치의 것이 아니라 `main` 의 것을 쓴다 (`ci.yml` 판정 스텝, `claude.yml` 의 repair 재검증).
    - **자동 머지 보호 장치 자체를 바꾸는 PR**(`ci.yml` 의 automerge, `ship-branch.sh`, `pr-scope.sh`, `claude.yml` 등)은 `automerge` 라벨 없이 사람이 직접 검토·머지한다.
    - **적용 범위 확대 조건:** `android/` 프로젝트가 생성된 이후에는 `shared/` 의 공유 계약 변경도 Kotlin 테스트에 영향을 주므로, `android/` 생성 PR 에서 위 가드의 대상에 `shared/` 변경을 포함한다. 그 전에는 적용하지 않는다.
    - 브랜치 보호의 필수 상태 검사 지정은 저장소 설정이며 사람이 확인한다.
