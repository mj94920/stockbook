# #29 SQLite 저장 구조 — 설계 검증 (조사 + 설계 초안)

- 상태: **설계 문서. 구현 아님.** 마이그레이션 코드·저장 계층·`package.json` 의존성 변경은 이 문서 범위 밖이다.
- 대상 이슈: #29 (선행: `CLAUDE.md` §8-2 게이트). 후속 연결: #47 Asset, #49 시계열, #30 백업, Contract Gate.
- 승인 상태(2026-10-10): **조건부 승인.** D1~D11 처리 결과는 §11. PR 전 보완 3건은 §3-4(레코드 `id` 와 `asset_id`), §4-5(무손실 왕복 규칙), §6-4~§6-6(이전 완료 판정·저장 실패·롤백 경계)에 반영했다.
- 추가 확정(2026-10-10, 후속): **D4 섀도 JSON 폐기**(§6-3), **Windows 스파이크 실행 승인**(#55 머지 확인 후, 별도 검증 브랜치·PR, 앱 저장 계층 구현 금지, 결과 보고 후 드라이버 최종 확정 — §2-3).
- 추가 확정(2026-10-10, 스파이크 결과): **드라이버 확정 — `better-sqlite3` 12.11.1, `<13` 고정, `sql.js` 불채택**(§2-4). 스파이크 필수 12개 중 11개 통과, 실패 1건은 드라이버가 아니라 입력 보존 규칙 문제이며 §4-5 규칙 6 에 반영했다. 저장 계층 구현은 별도 승인 전까지 시작하지 않는다.
- 제한: 문서 전용 / 앱 코드·의존성·마이그레이션 구현 변경 금지 / Windows 빌드 스파이크 실행은 별도 승인 / `queue`·`automerge` 라벨 금지 / 자동 머지 금지 / #55 정책 반영 확인 전 구현 착수 금지.
- 작성 기준: `mj94920/stockbook` main `5f2ae59`. 코드 인용은 모두 이 시점의 `index.html`·`main.js`·`preload.js`.
- Android 때문에 필요한 것: 스키마 의미 문서화, 어댑터 경계, `assets` 매핑, 시계열 수용 구조. StockBook 자체 개편: SQLite 이전, 무손실 마이그레이션, 롤백, 백업 구조.

## 0. 요약 (결론과 결정 요청)

1. **관심종목 경로는 하나다.** `state.watchlist` 가 실제 저장소이고, localStorage `sb_watchlist_v1` 은 호출처 없는 죽은 경로다(`getWatchlist()`/`saveWatchlist()` 정의만 있고 호출 0건, 읽는 곳은 1회성 레거시 이행 한 곳). #29 의 "통합"은 이 이행 규칙을 저장 계층으로 옮기고 죽은 함수를 정리하는 일이다. (§1-4)
2. **드라이버는 `better-sqlite3` 12.11.1(`<13` 고정)로 확정했다(D1, Windows 스파이크 결과 §2-4).** 13.x 는 Node ≥ 22 / N-API 10 을 요구해 Electron 31 과 맞지 않을 가능성이 높다. 속도는 선택 기준이 아니다(현재 데이터 규모에서는 JSON 저장도 충분히 빠르다). 기준은 빌드 위험, 증분 내구성, #49 규모다. `sql.js` 는 채택하지 않는다. (§2)
3. **이 이전의 가장 어려운 지점은 id 다.** 렌더러가 `state` 전체를 id 없이 보내므로, 어댑터가 행을 안정적으로 식별하려면 id 를 누가·어디서 부여하는지 먼저 정해야 한다. 승인(D2): 렌더러 `save()` 한 곳에서 UUID 부여, 기존 id 는 보존. 레코드 `id` 와 종목 `asset_id` 는 역할이 다르다. (§3-3, §3-4)
4. **스키마 v1 은 "레거시 무손실 보존 + 구조 선정의"** 다. 통화·정밀도 정규화와 `assetId` 채우기는 이후 버전(v2~)으로 분리한다. 일지는 거래 일지(`buy`/`sell`)와 관찰·메모(`watch`/`memo`)를 `kind` 와 `CHECK` 로 구분해 데이터상 혼동을 막는다. (§4)
5. D1~D11 의 처리 결과는 §11 에 있다. D1 은 스파이크 결과로 확정됐고, 열려 있는 결정은 없다(저장 계층 구현 승인만 남았다). **D4 는 확정: 섀도 JSON 을 폐기하고, 이전 후 SQLite 가 유일한 기준 저장소다.**
6. **무손실은 "JSON 으로 직렬화된 레거시 형태" 기준이다.** SQLite 의 타입 변환(문자열 `"123"` → 실수 `123`, 숫자 `5` → 텍스트 `"5.0"`, 짝 없는 서로게이트 → `U+FFFD`)이 값을 바꾸는 것을 직접 확인했고(서로게이트는 Windows 스파이크에서 Electron 31 + `better-sqlite3` 12.11.1 로도 재확인, §2-4), 이를 막는 규칙을 §4-5 에 정했다.

## 1. 현황 조사 (코드 근거)

### 1-1. 저장·로드 경로

| 경로 | 위치 | 동작 |
|---|---|---|
| 저장 `save()` | `index.html:5035` | `JSON.stringify(state)` 전체를 localStorage `stockbook_v1` 에 쓰고, Electron 이면 `saveState(data)` IPC 를 await 없이 호출 |
| 종료 시 | `index.html:5105` | `beforeunload` 에서 localStorage 에 동기 저장 |
| 파일 쓰기 | `main.js:1321` | 임시 파일에 쓴 뒤 rename(원자적), 하루 1회 `.bak` 복사. 경로 `%APPDATA%\StockBook\stockbook-data.json` |
| 로드 | `index.html:5082` | ① localStorage 즉시 적용 → ② `loadState()` IPC 로 파일 적용 → ③ 메인이 `did-finish-load` 300ms 뒤 `push-state` 로 파일을 다시 푸시. **파일이 localStorage 를 덮어쓴다** |
| 브라우저(Pages) | 동일 코드 | Electron API 가 없으면 localStorage 만 사용 (스모크 테스트가 이 경로를 검증) |

즉 Electron 에는 **같은 데이터가 localStorage 와 JSON 파일에 이중으로** 저장되고, 로드는 3번 일어난다. SQLite 로 옮길 때 이 이중 저장을 어떻게 끝낼지가 설계 항목이다(D5).

### 1-2. `state` 의 키와 레코드 형태

초기값: `{ portfolio, trades, journals, totalAsset, mcChecks, cashflows, mcSettings, monthlySnapshots, cashManual, analysisChecks, accounts }` (`index.html:4537`). 코드에서 추가로 쓰이는 키: `watchlist`, `watchlistGroups`, `stockMemos`, `goal`, `calEvents`, `autoLogin`, `mdiLayout`(폴백 제거됨).

| 키 | 형태 | 종목 연결 방식 | 순서 의미 |
|---|---|---|---|
| `portfolio[]` | `{name, ticker?, avgPrice, qty, sector, position, tradeType, currentPrice, target1~3, stop1, accountId}` | `name`(+선택 `ticker`) | 사용자에게 보이는 순서 |
| `trades[]` | `{date, name, ticker, type:'buy'/'sell', price, qty, total, weight, buyReason[], sellReason[], position, pnl, pnlPct, mental, note, tradeType, accountId}` | `name`(+`ticker`) | `push` → 시간순 |
| `journals[]` | `{date, buyDate, addDate, adds[], sellDate, investDays, name, type:'buy'/'sell', price, qty, total, weight, target1~3, stop1, tradeType, buyReasons[], buyNote, position, sellReasons[], sellNote, returnRate, resultNote, mental[], lesson, draft}` | **`name` 만** | `unshift` → 최신이 앞 |
| `watchlist[]` | `{ticker, name, market, group?, price, change, addedAt}` | `ticker`(비어 있을 수 있음)·`name` | 추가 순 |
| `watchlistGroups[]` | 그룹 이름 문자열 배열 | 항목이 그룹을 **이름 문자열**(`w.group`)로 참조 | 배열 순 |
| `stockMemos{}` | `{[code]: text}` | 코드 | — |
| `analysisChecks{}` | `{[stock.name]: {[checkKey]: bool}}` | **종목명이 키** | — |
| `cashflows[]` | `{date, type:'deposit'/'withdraw', amount, memo}` | — | `unshift` |
| `monthlySnapshots[]` | `{year, month, value}` | — | — |
| `accounts[]` | `{id, broker, number, nickname, type, isManual, isActive, cash, createdAt}` | `portfolio`/`trades` 가 `accountId` 로 참조 | — |
| `calEvents[]` | `{date, name, cat, ticker}` | `ticker` | — |
| 단일 값 | `totalAsset`, `cashManual`, `goal{principal,rate,months,add,startDate,savedAt}`, `mcSettings{}`, `mcChecks{}`, `autoLogin` | — | — |

**id 가 있는 것은 `accounts` 뿐이다.** 나머지에는 id, `createdAt`, `updatedAt` 이 없다.

### 1-3. 종목명 기반 관계가 걸린 곳 (#47 대상, #29 스키마가 미리 고려해야 함)

- 매도 시 일지 연동: `state.journals.find(j => j.name === s.name && j.type === 'buy')` (`index.html:8383`) — 이름이 같은 첫 매수 일지를 찾는다.
- `analysisChecks` 의 키가 `stock.name` (`index.html:12232`).
- `watchlist` 의 그룹이 이름 문자열.
- `trades`/`journals` 는 이름만, `portfolio`·`watchlist` 는 `ticker` 가 비는 경로가 있다 (이슈 #47 본문과 일치).
- **거래와 일지가 별도 레코드로 중복 저장**된다. 매수/매도 일지(`journals`)는 가격·수량·총액을 직접 갖고, 거래(`trades`)와 이름으로만 이어진다. 관찰·판단 메모는 지금 데이터 모델에 없다 → 신규 빠른 기록 타입(`watch`/`memo`)을 넣을 때 거래와 혼동되지 않게 하는 구조가 필요하다 (§4-3).

### 1-4. 관심종목 두 경로의 결론

| 경로 | 쓰는 곳 | 읽는 곳 | 판단 |
|---|---|---|---|
| `state.watchlist` | 추가·삭제·그룹 변경 코드 전부 (`index.html` 6983·7028·7036·11666·11672·13039·13134 등) | 렌더링 전부 | **현행 기준 저장소** |
| localStorage `sb_watchlist_v1` | `saveWatchlist()` — **호출 0건** | `getWatchlist()` — **호출 0건**, 그리고 `renderWatchlist()` 안의 1회성 이행(11690) | **죽은 경로**. 과거 버전 데이터 이행용으로만 남음 |

통합 규칙(설계): 최초 이전 시 `state.watchlist` 를 원천으로 삼고, 비어 있고 `sb_watchlist_v1` 이 있으면 그 값을 가져와 합친 뒤 키를 제거한다(현행 이행과 동일). 이전 후 `getWatchlist`/`saveWatchlist` 는 삭제한다. 브라우저(Pages)에서도 같은 규칙을 어댑터가 수행한다.

### 1-5. DB 로 옮기지 않는 것

기기별 UI 설정은 localStorage 에 그대로 둔다: `theme`, `sb_density`, `sb_rt_priority`, `sb_ui_v1`, `sbHdrIndices`, MDI 레이아웃(`sb_mdi_layout_v2`). 사용자 데이터가 아니고 기기마다 달라도 된다. API 키는 `safeStorage` 파일(`*-cred.enc`)이며 이 이전과 무관하다(#30 백업 제외 규칙 유지).

## 2. 드라이버 검증

### 2-1. 후보와 제약

| 항목 | `better-sqlite3` | `sql.js` |
|---|---|---|
| 형태 | 네이티브 애드온(동기 API) | SQLite 를 WASM 으로 컴파일, 순수 JS |
| 저장 방식 | 파일에 직접·증분 기록(WAL) | DB 전체를 메모리에 두고 `export()` 로 **전체 파일을 다시 씀** (파일 교체는 tmp+rename 으로 원자화 가능) |
| 빌드 위험 | Electron·NSIS 에서 네이티브 바이너리 필요 | 없음 (`.wasm` 파일 동봉만) |
| 최신 버전 요건 | **13.x: `engines.node >= 22`, `NAPI_VERSION=10`, 패키지에 prebuilds 동봉.** 12.x: `engines 20.x‖22.x‖…`, `prebuild-install` 로 Electron ABI 별 바이너리 | 1.14.2, 제한 없음 |
| 이 프로젝트와의 적합성 | Electron 31.7.7(ABI 125, Node 20 계열)과 13.x 는 맞지 않을 가능성이 높음 → **12.x 로 고정** 필요 | 무관 |

확인한 사실(이 세션에서 직접 확인):
- `node-abi` 로 Electron 31.7.7 → ABI **125** 확인.
- `better-sqlite3` 13.0.3 의 `package.json`: `engines.node: ">=22"`, `binding.gyp`: `NAPI_VERSION=10`. 12.2.0·12.4.1 은 `engines: 20.x||22.x||23.x||24.x`, 의존성 `prebuild-install`.
- 12.11.1 과 11.10.0 에 대해 `better-sqlite3-v<버전>-electron-v125-win32-x64.tar.gz` 릴리스 자산이 존재함(범위 요청 HTTP 206). **Electron 31 / Windows x64 용 사전 빌드가 있다.**
- `electron-builder` 설정(`package.json`)은 `asar: false`, `files` 화이트리스트이지만 이미 `ws` 를 의존성으로 포함해 정상 배포 중이므로 프로덕션 의존성은 패키징에 포함된다.

확인하지 못한 것(스파이크 전 시점의 기록 — 결과는 §2-4): Electron 31 이 번들하는 Node 의 정확한 버전(공식 인덱스에 접속할 수 없었음 — Node 20 계열이라는 것은 알려진 사실에 근거한 추정), 그리고 **실제 Windows 러너에서의 `npm ci` → `electron-builder --win nsis` → 설치본 실행**. 이 마지막 항목이 스파이크 대상이다.

### 2-2. 성능 측정 (참고용, 이 환경의 상대값)

환경: Linux, Node 22.22, `better-sqlite3` 13.0.3, `sql.js` 1.14.2. 합성 데이터이며 절대값은 Windows 에서 다르다. 거래 레코드 N건이 쌓인 상태에서 1건을 바꾸고 저장하는 비용(평균).

| N | 현행 JSON 전체 직렬화 + 파일 교체 | `better-sqlite3` UPDATE 1행 (WAL) | `sql.js` UPDATE + export + 파일 교체 |
|---|---|---|---|
| 1,000 | 2.0 ms (0.2 MB) | < 0.1 ms | 1.0 ms |
| 10,000 | 23.6 ms (2.0 MB) | < 0.1 ms | 6.1 ms |
| 100,000 | 298.5 ms (19.7 MB) | < 0.1 ms | 16.1 ms |

#49 규모(일봉 100만 행 ≈ 4,000종목 × 250일, 정수 컬럼):

| 항목 | `better-sqlite3` | `sql.js` |
|---|---|---|
| 일괄 삽입 100만 행 | 2.9 s, 파일 26.6 MB | 2.5 s |
| 저장 1회 | (증분) | export + 기록 119 ms (26.6 MB) |
| 종목별 최근 20일 조회 | 0.008 ms/건 | — |
| 일일 갱신(4,000행 upsert) | 70 ms | — |

해석:
- **현재 사용자 데이터 규모(수백~수천 건)에서는 JSON 도 `sql.js` 도 체감 차이가 없다.** #29 의 가치는 속도가 아니라 쓰기 중 종료 시 손상 위험 제거, 증분 저장, 스키마·버전 경계, #49 수용이다. 이슈 본문의 "저장 시간 기준선 대비 단축"은 큰 데이터에서만 의미가 있다.
- `sql.js` 의 전체 export 는 사용자 DB 에는 충분하다(12 MB 에서 16 ms). 하지만 시계열이 10년치(약 1,000만 행)로 커지면 DB 전체를 메모리에 올리고 매 저장마다 수백 MB 를 쓰게 된다. → **시계열 DB 는 사용자 DB 와 파일을 분리**하는 것이 어느 드라이버에서든 유리하다(D6).
- `better-sqlite3` 의 동기 호출은 메인 프로세스를 잠시 막지만 호출당 1 ms 미만이다. 시작 시 마이그레이션처럼 큰 작업은 창이 뜨기 전에(스플래시 동안) 수행한다.

### 2-3. 선택과 선행 스파이크

**스파이크 실행 승인(2026-10-10, 실행·확정 완료 — 결과는 §2-4):** #55 머지 확인 후 실행하며, 별도 검증 브랜치·PR 에서만 수행한다(머지하지 않음). 본 앱의 저장 계층 구현·`package.json` 변경은 하지 않는다. 결과를 보고한 뒤 드라이버를 최종 확정하고, 저장 계층 구현은 별도 승인을 기다린다.

D1(승인, 조건부 → **§2-4 에서 확정**): **`better-sqlite3` 12.x(13 미만 고정)를 우선**하고 아래 스파이크 통과 후 확정. 근거: 증분 내구성(WAL), #49 규모 여유, Electron 31 용 사전 빌드 존재.
선행 스파이크(구현 승인 전 필수):
1. `windows-latest` 에서 `npm ci` + `electron-builder --win nsis --dir` 성공
2. 패키지 안에 `.node` 바이너리 포함 확인(`asar:false`)
3. 설치본(또는 `--dir` 산출물)에서 `require('better-sqlite3')` 로 DB 를 열고 읽고 쓰는 최소 확인
4. **사용자 이름에 한글이 있는 경로**(`%APPDATA%`)에서 DB 파일 열기
5. 종료 중 강제 종료 후 재시작 시 DB 가 열리는지(WAL 복구)

하나라도 실패하면 `sql.js` 로 폴백한다. `sql.js` 폴백 시 달라지는 것: 저장이 전체 export(+원자적 교체)가 되고 WAL 이 없으며, 사용자 DB 는 괜찮지만 시계열은 `market.db` 분리가 필수가 된다. 스키마와 어댑터 인터페이스는 동일하게 유지한다(§3).

### 2-4. Windows 스파이크 결과와 드라이버 확정 (2026-10-10)

**실행 근거:** 검증 전용 Draft PR #58(머지하지 않음, 검증 후 close) · 브랜치 `claude/spike-sqlite-windows` · 워크플로 run `38026482159` · 커밋 `1d2ddca` · 러너 `windows-latest`(Windows Server 2025). 앱 코드·`package.json`·저장 계층은 건드리지 않았고, 러너의 작업 사본에만 `better-sqlite3@12.11.1` 을 설치해 실제 앱의 `electron-builder` 설정(`asar:false`, NSIS)으로 패키징했다. 앞선 두 실행은 하네스 결함(pwsh 인자 분리, GUI exe 종료 미대기)으로 무효였고 결과에 사용하지 않았다.

**환경(패키지된 앱의 Electron 런타임에서 측정):** Electron 31.7.7 / Node 20.18.0 / ABI 125 / N-API 9 / Chrome 126 / SQLite 3.53.2. 이로써 §2-2 의 "번들 Node 버전 미확인"과 "Node 20 계열 추정"은 실측으로 대체된다.

**빌드·패키징:** `better-sqlite3` 12.11.1 **프리빌트 바이너리** 설치에 성공했고 **소스 빌드(컴파일러)는 필요하지 않았다.** `.node`(약 1.9 MB)가 `asar:false` 패키지(`resources/app/node_modules/better-sqlite3/build/Release`)에 포함됐다. NSIS 설치 파일(77.8 MB)이 생성됐고 silent 설치(`/S`)한 설치본에서도 동일하게 동작했다. `--dir` 산출물과 설치본의 결과는 같았다.

**결과: 필수 12개 중 11개 통과, 1개 실패(그대로 기록하며 소급해서 통과로 바꾸지 않는다).**

| 항목 | 결과 |
|---|---|
| T1 DB 열기·WAL·읽기/쓰기 — 일반 경로 / 한글 디렉터리 / 한글 파일명 | 통과 |
| T2 컬럼 친화성 변환이 §4-5 표와 일치 | **실패 — 짝 없는 서로게이트 1건**(아래) |
| T3a 강제 종료(커밋 안 된 트랜잭션): 재오픈 후 무결성 ok, 커밋분 보존, 미커밋분 제거 | 통과 |
| T3b 강제 종료(자동 커밋 연속 쓰기 중): 무결성 ok | 통과 |
| T4a/b 임시 DB 를 닫은 뒤 rename 으로 최종 DB 생성 / 기존 파일 교체 | 통과 |
| T5 두 프로세스: 쓰기 락 보유 중 다른 프로세스의 쓰기는 `SQLITE_BUSY`, 읽기(WAL)는 허용, 해제 후 쓰기 성공 | 통과 |
| T6a `VACUUM INTO` 스냅샷 / T6b `db.backup()` 온라인 백업 | 통과 |
| T7 `PRAGMA user_version` 설정·조회, `quick_check` | 통과 |

관찰값(통과/실패 판정 아님): ① DB 가 열려 있는 동안 rename·삭제는 모두 `EBUSY` → **파일 교체는 반드시 DB 를 닫은 뒤에 한다**(§6-1 4단계의 임시 파일 방식과 일치). ② 정상 종료 후 `-wal`/`-shm` 파일은 남지 않았다. ③ 10만 건 일괄 삽입 약 107 ms, 단건 UPDATE 약 0.02 ms(이 러너에서의 값이며 성능 계약이 아니다).

**강제 종료 수치의 해석(T3b):** 자식 프로세스가 보고한 커밋 수는 950건, 재오픈한 DB 에는 991건이 남았다. 이는 손실이 아니라 **보고 시점과 실제 커밋 시점의 차이**(보고가 커밋보다 늦음)이며, 이 수치를 정확한 보장 값으로 쓰지 않는다. 이 시험이 확인하는 핵심은 **미커밋 데이터 제거 + DB 무결성 유지**이다.

**실패 1건의 성격:** `'a\ud800b'`(짝 없는 서로게이트)를 `TEXT` 에 바인딩하면 읽을 때 `a���b`(U+FFFD 3개)로 돌아온다. 하네스는 `a\ufffdb`(1개)를 기대했으나 실제는 달랐다. 어느 쪽이든 **원문이 손실된다.** 이것은 `better-sqlite3` 의 결함이 아니라 SQLite `TEXT`(UTF-8)가 짝 없는 서로게이트를 표현할 수 없다는 한계에서 오는 **입력 정규화·보존 규칙의 문제**이며, 드라이버를 바꿔도(`sql.js` 포함) 같다. 해결은 §4-5 규칙 6 에 둔다. 나머지 변환(`"123"`→`123`, `5`→`"5.0"`, `"007"`→`7`, NUL·이모지·한글, 실수 4종 비트 일치)은 §4-5 표와 일치했다.

**확정(D1):**
- SQLite 드라이버는 **`better-sqlite3` 12.11.1, `<13` 범위 고정**으로 확정한다. 13.x 는 Node ≥ 22 / N-API 10 을 요구해 Electron 31(Node 20.18.0, N-API 9)과 맞지 않는다.
- **`sql.js` 대안은 채택하지 않는다.** §2-3 의 폴백 조건(스파이크 항목 중 하나라도 실패)에 해당하는 드라이버 결함은 없었다.
- 이 확정은 기술 검증(드라이버·패키징·복구 기반)에 대한 것이다. **저장 계층 구현·마이그레이션 구현·`package.json` 의존성 추가는 별도 승인 전까지 하지 않는다.**
- 스파이크 코드와 워크플로는 제품 브랜치에 남기지 않는다(#58 은 머지하지 않고 close). 재현이 필요하면 이 절의 run·커밋을 근거로 한다.
- 이 결과는 #29 가 만들 백업·교체·롤백 기반(§6)이 실제 Windows 설치 환경에서 동작한다는 근거이며, #47 의 `asset_id` 마이그레이션이 그 위에서 수행되는 순서(#29 → #47)를 뒷받침한다.

## 3. 아키텍처 원칙

### 3-1. 데이터 모델과 IPC 의 분리

- **IPC 시그니처는 데이터 모델의 계약이 아니다.** 계약은 스키마 문서(이 문서의 §4 → 이후 `shared/docs/DATA_CONTRACT.md`)다.
- v1 에서는 렌더러 코드를 바꾸지 않기 위해 기존 `load-state`/`save-state`/`push-state` 를 **레거시 호환 어댑터**로 유지한다. 어댑터 안에서 "레거시 `state` JSON ↔ 테이블 행" 변환을 한다. 이 변환은 임시 호환 계층이며, 이후 단계에서 테이블 단위 IPC 로 대체해도 스키마는 바뀌지 않는다.

```
renderer(state JSON, 기존 형태)
   │ load-state / save-state / push-state   ← 레거시 호환(임시), 계약 아님
   ▼
main: StorageAdapter  ── JSON ↔ 행 변환, id/updated_at/row_hash 관리, 트랜잭션
   ▼
SQLite (스키마 v1)   ← 데이터 의미의 기준 (Android 도 같은 의미를 구현)
```

### 3-2. 저장 인터페이스(개념)

`StorageAdapter` 는 메인 프로세스 쪽 모듈이고 인터페이스는 다음 동작만 가진다(구현은 후속 단계): 초기화/열기(스키마 버전 확인·이전), `loadLegacyState()`, `saveLegacyState(stateJson)`(트랜잭션 + 변경분 반영), `integrityCheck()`, `exportSnapshot()`(#30). 브라우저(Pages)용 구현은 localStorage 를 그대로 쓰는 별도 어댑터로 두고(D7), 두 어댑터는 같은 `loadLegacyState`/`saveLegacyState` 형태를 따른다.

### 3-3. id·시각 부여 지점 (핵심 설계 결정)

문제: 렌더러는 `state` 를 통째로 보낸다. 레코드(`trades` 등)에는 id 가 없고 `push`/`unshift` 로 새 객체가 생긴다. 어댑터가 "이 객체가 DB 의 어느 행인지" 알 방법이 없으면 매 저장마다 전체 삭제·재삽입이 되고 id 도 매번 바뀐다 (#47 의 "발급 후 불변"을 깨뜨림).

| 안 | 내용 | 평가 |
|---|---|---|
| A. 어댑터가 위치(배열 인덱스)로 매칭 | 정렬·삭제·삽입에 취약 | 기각 |
| B. 어댑터가 id 를 부여하고 저장 응답으로 돌려줌 | `save()` 가 fire-and-forget 이고 객체마다 반영해야 함 → 렌더러 변경 큼 | 비권고 |
| **C. 렌더러 `save()` 가 직렬화 직전에 id 없는 레코드에 UUID 부여** | 변경 지점 1곳(`save()` 안의 `_ensureIds(state)`), 생성 시점이 모든 `push` 경로에 걸리지 않음, 로드 시 기존 레코드에도 같은 규칙 | **승인(D2)** |

- `createdAt`/`updatedAt`/`row_hash` 는 **어댑터가 관리**한다. 레코드를 정규화(JSON, 키 정렬)해 해시를 만들고 저장된 `row_hash` 와 다를 때만 `updated_at` 을 갱신한다. 렌더러는 시각을 모른다.
- 삭제는 저장된 id 집합 − 들어온 id 집합 = 삭제 대상으로 판정한다(D3: 소프트 삭제 `deleted_at` 권고 — 이후 동기화에서 삭제 전파가 필요하기 때문).
- 순서는 `seq` 컬럼으로 보존한다(`unshift` 로 쌓이는 배열 순서가 화면과 동치성 검증에 필요).

### 3-4. 레코드 `id` 와 종목 `asset_id` — 역할과 불변성

둘은 이름이 비슷하지만 **식별하는 대상이 다르다.** 혼용하면 #47 의 설계가 깨진다.

| | 레코드 `id` | 종목 `asset_id` |
|---|---|---|
| 식별 대상 | **기록 한 건**(보유 한 행, 거래 한 건, 일지 한 편, 관심종목 한 줄 …) | **종목(자산) 자체** |
| 위치 | 각 사용자 데이터 테이블의 PK (`holdings.id`, `trades.id`, `journals.id` …) | `assets.asset_id` (PK), 다른 테이블은 FK 컬럼 `asset_id` 로 참조 |
| 발급 | 렌더러 `save()` 의 `_ensureIds`(신규 기록) / 이전 시 id 없는 레거시 기록(v1) | 최초 마이그레이션(#47, v2). `stockbook` 이 발급, `stockCode+market` 에서 계산하지 않음 |
| 형식 | 불투명 문자열(UUID v4). 레거시 `accounts.id` 처럼 이미 있는 id 는 **그대로 보존**(UUID 가 아니어도 됨) | 불투명 UUID 계열 |
| 불변성 | **발급 후 바뀌지 않음.** 내용 수정·종목 변경·소프트 삭제에도 유지. 삭제된 id 는 재사용하지 않음 | **발급 후 바뀌지 않음.** 종목명·종목코드·시장 변경에도 유지 |
| 같은 종목의 여러 기록 | 기록마다 다른 `id` | 모두 같은 `asset_id` 를 참조 |
| 용도 | 기록 단위의 변경 추적·삭제 전파·동기화, 기록 간 연결(`journals.trade_id` → `trades.id`) | 종목 단위의 모아보기·시세·시계열 연결 |

규칙:
1. **관계는 id 로만 건다.** 기록 간은 `*_id`(레코드 id), 기록과 종목 간은 `asset_id`. `name`·`ticker`·`stockCode` 는 관계 키로 쓰지 않는다.
2. **`id` 는 종목을 담지 않는다.** 같은 종목의 거래 두 건이 같은 `id` 를 갖거나, `id` 로 종목을 추정하는 코드는 금지다.
3. **불변성은 스키마로 강제한다.** `assets.asset_id` 와 모든 사용자 테이블의 `id` 에 `BEFORE UPDATE` 트리거를 두어 값 변경을 거부한다(§4 DDL 끝, 시험 §4-2). 기록이 가리키는 `asset_id`(FK 컬럼) 값은 "종목 연결" 조작으로 NULL → 값, 또는 오연결 정정 시에만 바뀔 수 있고, 그것은 **기록의 속성 변경**이지 식별자 변경이 아니다.
4. **기존 id 보존(D2).** `_ensureIds` 는 `id` 가 **없는** 레코드에만 UUID 를 붙이며 이미 있는 값을 다시 만들지 않는다. 이전 시에도 이미 id 가 있으면 그대로 쓴다.
5. **중복 id 방어.** 렌더러가 객체를 복제(`{...t}`)해 같은 `id` 가 한 배열에 두 번 나오면, `_ensureIds` 는 **첫 번째만 유지하고 나머지에 새 UUID** 를 붙인다. 어댑터는 그래도 같은 테이블 안 중복 id 를 발견하면 저장을 거부한다(오류 코드, §6-5). PK 충돌을 조용히 새 id 로 덮지 않는다.
6. **삭제된 id.** 소프트 삭제(D3)된 행의 `id` 는 남아 있으므로 재사용되지 않는다. 사용자가 같은 내용을 다시 입력하면 새 `id` 다.
7. `asset_id` 의 발급·매핑 보존·멱등성 규칙은 #47 본문을 따른다. 이 문서는 v1 에서 **구조와 불변성 제약만** 제공한다.

## 4. 스키마 v1 (설계 초안)

원칙:
1. **무손실 보존이 1순위.** 알려진 필드는 컬럼으로, 모르는 필드·향후 필드는 `extra_json` 으로 보존한다. 이전 검증은 "레거시 `state` → DB → 레거시 `state`" 가 값·순서까지 같은지로 한다.
2. 숫자는 레거시 값 그대로(`REAL`). 통화·정밀도 정규화(정수 최소단위)는 Contract Gate 이후 별도 마이그레이션이다. 지금 정규화하면 확정되지 않은 계약을 굳히게 된다.
3. 시각은 ISO 8601 UTC 문자열(`created_at`/`updated_at`/`deleted_at`). 기존 `date` 필드(`YYYY-MM-DD`)는 원문 보존.
4. 종목 관계 컬럼 `asset_id`(nullable)와 `assets` 테이블은 **구조만 정의, v1 에서는 비어 있음**. 채우는 일은 #47(v2 데이터 마이그레이션). 기존 `name`/`ticker` 는 표시·매칭용으로 남기되 관계 키가 아니다.
5. 모든 사용자 레코드에 `id`, `seq`, `created_at`, `updated_at`, `deleted_at`, `row_hash`.
6. SQLite 표준 기능만 사용한다(`STRICT`·`JSON` 함수·`RETURNING` 에 의존하지 않음). Android(Room/플랫폼 SQLite)가 같은 DDL 로 구현할 수 있게 한다.

실제 DDL(SQLite 3.45.1 에서 구문·제약 검증 완료, 아래 §4-2):

```sql
-- StockBook 저장 스키마 v1 (설계 초안). 모든 시각은 ISO 8601 UTC 문자열, 기존 'YYYY-MM-DD' 날짜 필드는 원문 보존.
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL,
  app_version TEXT NOT NULL,
  note        TEXT
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id         TEXT PRIMARY KEY,
  seq        INTEGER NOT NULL,
  broker     TEXT, number TEXT, nickname TEXT, account_type TEXT,
  is_manual  INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0,1)),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  cash       REAL,
  extra_json TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE assets (
  asset_id   TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock','etf')),
  market     TEXT,
  stock_code TEXT,
  name       TEXT NOT NULL,
  currency   TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (market, stock_code)
);

CREATE TABLE holdings (
  id         TEXT PRIMARY KEY,
  seq        INTEGER NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  asset_id   TEXT REFERENCES assets(asset_id),
  name       TEXT NOT NULL,
  ticker     TEXT,
  qty        REAL NOT NULL DEFAULT 0,
  avg_price  REAL,
  sector TEXT, position TEXT, trade_type TEXT,
  current_price REAL, target1 REAL, target2 REAL, target3 REAL, stop1 REAL,
  extra_json TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX holdings_asset ON holdings(asset_id);

CREATE TABLE trades (
  id         TEXT PRIMARY KEY,
  seq        INTEGER NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  asset_id   TEXT REFERENCES assets(asset_id),
  name       TEXT NOT NULL,
  ticker     TEXT,
  trade_date TEXT NOT NULL,
  side       TEXT NOT NULL CHECK (side IN ('buy','sell')),
  price      REAL NOT NULL,
  qty        REAL NOT NULL,
  total      REAL,
  trade_type TEXT, position TEXT, weight REAL,
  pnl REAL, pnl_pct REAL, mental TEXT, note TEXT,
  buy_reasons_json TEXT, sell_reasons_json TEXT,
  extra_json TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX trades_asset_date ON trades(asset_id, trade_date);

CREATE TABLE journals (
  id         TEXT PRIMARY KEY,
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('buy','sell','watch','memo')),
  trade_id   TEXT REFERENCES trades(id),
  asset_id   TEXT REFERENCES assets(asset_id),
  name       TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  buy_date TEXT, add_date TEXT, sell_date TEXT, invest_days INTEGER,
  price REAL, qty REAL, total REAL, weight REAL,
  target1 REAL, target2 REAL, target3 REAL, stop1 REAL,
  trade_type TEXT, position TEXT,
  buy_note TEXT, sell_note TEXT, result_note TEXT, lesson TEXT, return_rate REAL,
  buy_reasons_json TEXT, sell_reasons_json TEXT, mental_json TEXT, adds_json TEXT,
  draft INTEGER NOT NULL DEFAULT 0 CHECK (draft IN (0,1)),
  extra_json TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (kind IN ('buy','sell') OR (price IS NULL AND qty IS NULL AND total IS NULL))
);
CREATE INDEX journals_asset_date ON journals(asset_id, entry_date);

CREATE TABLE watchlist_groups (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL UNIQUE,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE watchlist (
  id        TEXT PRIMARY KEY,
  seq       INTEGER NOT NULL,
  group_id  TEXT REFERENCES watchlist_groups(id),
  asset_id  TEXT REFERENCES assets(asset_id),
  name TEXT, ticker TEXT, market TEXT,
  added_at  INTEGER,
  extra_json TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX watchlist_asset ON watchlist(asset_id);

CREATE TABLE stock_memos (
  code TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES assets(asset_id),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE analysis_checks (
  name_key  TEXT NOT NULL,
  check_key TEXT NOT NULL,
  asset_id  TEXT REFERENCES assets(asset_id),
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (name_key, check_key)
);

CREATE TABLE cashflows (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL,
  flow_date TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  amount REAL NOT NULL,
  memo TEXT,
  extra_json TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE monthly_snapshots (
  year INTEGER NOT NULL, month INTEGER NOT NULL, value REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (year, month)
);

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL,
  event_date TEXT NOT NULL, name TEXT NOT NULL, category TEXT, ticker TEXT,
  asset_id TEXT REFERENCES assets(asset_id),
  row_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
-- 불변성(§3-4): 레코드 id 와 asset_id 는 한 번 정해지면 바뀌지 않는다
CREATE TRIGGER assets_asset_id_immutable BEFORE UPDATE OF asset_id ON assets
  WHEN NEW.asset_id IS NOT OLD.asset_id
  BEGIN SELECT RAISE(ABORT, 'asset_id is immutable'); END;
CREATE TRIGGER accounts_id_immutable BEFORE UPDATE OF id ON accounts
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER holdings_id_immutable BEFORE UPDATE OF id ON holdings
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER trades_id_immutable BEFORE UPDATE OF id ON trades
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER journals_id_immutable BEFORE UPDATE OF id ON journals
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER watchlist_groups_id_immutable BEFORE UPDATE OF id ON watchlist_groups
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER watchlist_id_immutable BEFORE UPDATE OF id ON watchlist
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER cashflows_id_immutable BEFORE UPDATE OF id ON cashflows
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
CREATE TRIGGER calendar_events_id_immutable BEFORE UPDATE OF id ON calendar_events
  WHEN NEW.id IS NOT OLD.id
  BEGIN SELECT RAISE(ABORT, 'id is immutable'); END;
```

### 4-1. 테이블 개요

| 테이블 | 레거시 대응 | 비고 |
|---|---|---|
| `schema_version` | — | 적용 이력(버전, 시각, 앱 버전). `PRAGMA user_version` 과 같은 값을 유지 |
| `settings` | `totalAsset`, `cashManual`, `goal`, `mcSettings`, `mcChecks`, `autoLogin` | 키-값(JSON). 단일 값 묶음 |
| `accounts` | `accounts[]` | 레거시 id 문자열 그대로 사용 |
| `assets` | (신규) | `UNIQUE(market, stock_code)` + 불변 `asset_id`. **v1 에서는 비어 있음** |
| `holdings` | `portfolio[]` | `qty`/`avg_price` 는 저장값 그대로(§4-4) |
| `trades` | `trades[]` | `type` → `side` |
| `journals` | `journals[]` | `kind` 확장(§4-3), `trade_id`(nullable)로 거래와 연결 |
| `watchlist_groups`, `watchlist` | `watchlistGroups[]`, `watchlist[]` | 그룹을 이름 문자열 대신 id 로 참조 |
| `stock_memos` | `stockMemos{}` | 코드 키 |
| `analysis_checks` | `analysisChecks{}` | **종목명 키(`name_key`)** 를 그대로 보존하고 `asset_id`(nullable) 추가 |
| `cashflows`, `monthly_snapshots`, `calendar_events` | 동명 | |

### 4-2. DDL 검증 결과

임시 SQLite(3.45.1, `PRAGMA foreign_keys=ON`)에서 전 테이블 생성, `integrity_check = ok`, `foreign_key_check` 위반 0, 그리고 아래 제약을 직접 시험했다(전부 의도대로).

- 거래 일지(`buy`)에는 가격·수량 허용 / 관찰 일지(`watch`)에 가격·수량 → 거부 / 메모(`memo`)에 수량만 → 거부 / 가격·수량 없는 관찰 일지 → 허용 / 알 수 없는 `kind` → 거부
- `trades.side` 가 `buy`/`sell` 이 아니면 거부
- `(market, stock_code)` 중복 거부, 같은 코드의 다른 시장 허용, `stock_code` NULL 은 여러 건 허용(미확정 종목), 존재하지 않는 `asset_id` 참조 거부, `asset_id` NULL(미연결) 허용
- `watchlist_groups.name` 중복 거부
- 불변성 트리거: `assets.asset_id` 변경 거부, 각 사용자 테이블의 `id` 변경 거부, `asset_id` **FK 컬럼**(예: `holdings.asset_id`)의 NULL → 값 갱신은 허용

미검증: 실제 레거시 데이터와의 왕복 동치성, Android Room 매핑, `better-sqlite3` 에 포함된 SQLite 버전과의 차이(표준 구문만 사용해 영향은 작다고 판단).

### 4-3. 일지: 거래와 관찰·메모의 데이터상 구분

사용자 지침(빠른 기록은 모바일 편의 기능, 전체 투자일지는 기존 핵심 서식 보존, 거래와 관찰·판단 메모가 데이터상 혼동되지 않도록)을 스키마로 옮기면 다음과 같다.

- 현행 일지(`type: 'buy'|'sell'`)는 이미 가격·수량·총액을 직접 가진 **거래 일지**다. 이 서식은 `kind IN ('buy','sell')` 로 그대로 보존한다(기존 컬럼 전부 유지).
- 빠른 기록의 **관찰·판단 메모**는 `kind IN ('watch','memo')` 로 구분하고, `CHECK` 로 **가격·수량·총액을 가질 수 없게** 강제한다. 거래 사실은 `trades` 가 소유하고 일지는 사유·메모를 소유한다.
- 거래 일지는 `trade_id` 로 `trades` 의 해당 거래를 가리킬 수 있다(nullable). 현재는 이름으로만 이어져 있어 마이그레이션 시 연결하지 못한 일지는 NULL 로 남는다(#47 이후 연결 UI).
- **이 `kind` 확장과 빠른 기록의 자동 첨부(종가·상태·사건 스냅샷)는 Contract Gate 결정 사항**이다. v1 은 구조(컬럼·`CHECK`)만 마련하고 `watch`/`memo` 행은 만들지 않는다. 신호 스냅샷 컬럼은 추가하지 않는다(저장 시점·스냅샷 규격이 확정되기 전에 컬럼을 만들면 계약을 앞질러 굳힌다). 필요 시 `extra_json` 으로 임시 수용한다.

### 4-4. 평균단가와 숫자 타입

- PC 앱에서 `holdings.avg_price` 는 **사용자가 편집하는 저장값**이다(수동 등록 경로 포함). "평균단가는 거래 기록에서 계산"은 Android 표시 규칙이며, PC 데이터에는 거래 없이 만들어진 보유가 있을 수 있다. v1 은 저장값을 보존하고(무손실), 계산 방식은 Contract/규칙 엔진 단계에서 정한다(D10).
- 금액·수량은 레거시 값 그대로 `REAL`. 통화(`currency`)와 최소단위 정규화는 Contract Gate 이후 마이그레이션이다(D8). 통화가 다른 자산을 합산하지 않는 원칙은 표시 계층 규칙이며 v1 저장 구조는 영향을 주지 않는다.

### 4-5. 무손실 왕복 검증 규칙

**기준:** 무손실이란 "레거시 `state` 를 DB 에 넣었다가 다시 조립했을 때, **디스크에 있던 JSON(`JSON.parse` 결과)과 깊은 비교로 같다**"이다. 비교 기준은 메모리의 `state` 가 아니라 현재 앱이 실제로 저장하는 형태다. `save()` 가 `JSON.stringify(state)` 를 거치므로 `NaN`·`Infinity`·`undefined` 는 이미 `null`/생략으로 변해 있고(확인함), 이것은 이전 전에 일어난 레거시 동작이라 검증 범위 밖이다. 중복 키가 있는 JSON 은 `JSON.parse` 가 마지막 값을 택한다(확인함) — 이것도 파싱 단계의 레거시 동작이다.

**SQLite 가 값을 바꾸는 경우(이 세션에서 `better-sqlite3` 로 직접 확인):**

| 바인딩한 값 | 컬럼 | 저장·조회 결과 | 손실 |
|---|---|---|---|
| 문자열 `"123"` | `REAL` | 숫자 `123` (실수) | 타입 손실 |
| 문자열 `"abc"` | `REAL` | 문자열 `"abc"` 그대로 | 없음(하지만 컬럼 타입이 뒤섞임) |
| 숫자 `5` | `TEXT` | 텍스트 `"5.0"` | 타입·표현 손실 |
| 숫자 `1.50` | `TEXT` | 텍스트 `"1.5"` | 타입 손실 |
| 문자열 `"007"` | `INTEGER` | 정수 `7` | **선행 0 손실**(종목코드 `005930` 류) |
| 숫자 `1.5` | `INTEGER` | 실수 `1.5` | 없음 |
| 문자열 `"007"` | `TEXT` | `"007"` | 없음 |
| 짝 없는 서로게이트 `"a\ud800b"` | `TEXT` | `"a\ufffdb"`(13.0.3 Linux) / `"a\ufffd\ufffd\ufffdb"`(12.11.1 Windows, 스파이크) | **문자 손실** |
| NUL 문자 포함 문자열 | `TEXT` | 그대로 | 없음 |
| 이모지·한글·빈 문자열 | `TEXT` | 그대로 | 없음 |
| `0.1+0.2`, `1e21`, `2^53`, `Number.MAX_VALUE` | `REAL` | 비트 단위로 동일 | 없음 |

결론: **컬럼 친화성(affinity)이 값을 조용히 바꾼다.** 그래서 DB 에 넣기 전에 값을 **검사**해야 한다.

규칙:
1. **타입 선검사.** 각 필드는 "기대 JSON 타입"(문자열/숫자/불리언/배열/객체)을 가진다. 값의 실제 타입이 기대와 같을 때만 전용 컬럼에 넣는다.
   - 기대와 다르면(예: 숫자여야 할 `qty` 가 문자열 `"3"`, 문자열이어야 할 `ticker` 가 숫자 `5930`) **그 필드는 컬럼을 NULL 로 두고 원본 값을 `extra_json` 의 `__raw` 항목에 JSON 으로 보존**한다. 조립 시 `__raw` 가 있으면 그것이 우선한다. 값을 변환하거나 "바로잡지" 않는다.
2. **숫자는 `REAL` 컬럼에만, `INTEGER` 는 검증된 정수에만.** 정수 컬럼(`is_manual`, `draft`, `invest_days`, `year`, `month`, `seq`)은 값이 JS 정수일 때만 쓴다. 종목코드·전화번호처럼 선행 0 이 의미 있는 값은 항상 `TEXT` 이며 문자열 타입일 때만 넣는다.
3. **null / 누락 / 빈 값을 구분한다.** 레거시 객체의 필드는 (a) 키 없음, (b) `null`, (c) 빈 문자열 `""`·`0`·`false` 로 서로 다르다.
   - (a) → 컬럼 NULL + 어디에도 표시 없음. (b) → 컬럼 NULL + `extra_json.__nulls` 배열에 키 이름. (c) → 값 그대로.
   - 조립: 컬럼이 NULL 이고 `__nulls` 에 있으면 `null`, 없으면 키를 만들지 않는다.
4. **알 수 없는 필드는 버리지 않는다.** 매핑에 없는 레코드 키는 `extra_json` 에 원문 그대로, **매핑에 없는 최상위 `state` 키는 `settings` 에 키-값으로** 보존한다(예: 미래 버전이 추가한 키).
5. **배열은 순서까지 보존한다.** 목록 테이블은 `seq`, 중첩 배열(`buyReasons`, `adds` 등)은 JSON 텍스트로 그대로. 빈 배열 `[]` 과 키 없음은 구분한다(3 과 같은 방식).
6. **저장 전 타입 검사 — 짝 없는 서로게이트(스파이크 반영).** 문자열 값에 대해 `String.prototype.isWellFormed()` 가 `false` 이면(짝 없는 서로게이트 포함) 그 문자열을 SQLite `TEXT` 에 **그대로 맡기지 않는다.** 전용 컬럼은 NULL 로 두고 원문을 규칙 1 의 `__raw`(JSON 이스케이프 문자열, 서로게이트가 `\uD800` 형태로 보존)로 보존한다. 이는 삽입 후 읽어 보고 알게 되는 사후 검사가 아니라 **삽입 전에 판정하는 사전 검사**이며, Windows 스파이크의 `a\ud800b → a���b` 가 근거다(드라이버 결함이 아니라 입력 정규화·보존 규칙의 문제, §2-4). 아래의 왕복 검사는 그 외 예기치 못한 불일치에 대한 안전망으로 유지한다.
7. **문자열 왕복 검사(안전망).** 문자열 필드는 삽입 직후 읽어 원본과 비교하고, 다르면(예: 짝 없는 서로게이트) 그 필드를 규칙 1 의 `__raw`(JSON 이스케이프 문자열, 서로게이트가 `\uD800` 형태로 보존됨)로 옮긴다. 불일치를 이유로 이전 전체를 중단하지는 않는다 — 단 `__raw` 로도 복원되지 않으면 중단한다.
8. **숫자는 허용오차 없이 완전 일치**로 비교한다(`Object.is` 기준에서 `-0` 은 JSON 에 존재하지 않으므로 해당 없음).
9. **검증 절차(§6-1 5단계):** ① 디스크 JSON 과 DB 조립 결과를 모두 `JSON.parse` 한 값으로 만들고 ② 키를 정렬한 정규 형태로 ③ 타입까지 엄격하게 깊은 비교(문자열 `"100"` ≠ 숫자 `100`) ④ 불일치는 레코드 단위로 보고. 규칙 1·6·7 의 `__raw` 로 해소된 필드는 "변환 없이 보존"으로 집계하고 로그에 남긴다. 해소되지 않은 불일치가 하나라도 있으면 **전체 이전 중단**(부분 수용 없음).
10. **역방향 안정성.** DB → 레거시 상태 → DB 를 한 번 더 저장했을 때 **변경된 행이 0** 이어야 한다(`row_hash` 가 같아 `updated_at` 이 갱신되지 않음). 이 시험이 실패하면 변환이 비결정적이라는 뜻이다.
11. **기준 상태는 파싱 직후의 디스크 JSON** 이다. `_applyState` 가 기본 키(`portfolio:[]` 등)를 채우거나 `migrateAccountsDefault()` 가 계좌를 만드는 동작은 이전 검증의 기준이 아니다.

## 5. 버전·마이그레이션 경계

| 버전 | 내용 | 성격 |
|---|---|---|
| **v1** | 위 스키마 생성 + 레거시 JSON 전체 이전(무손실). `assets` 는 비어 있음 | 구조 + 데이터 이전 |
| **v2** (#47) | `assets` 채움, 각 행의 `asset_id` 채움, 이름·코드 기반 관계 제거 | 데이터 마이그레이션 (스키마 변경 없음 또는 최소) |
| v3~ (Contract Gate 이후) | 통화·최소단위 정규화, 일지 `watch`/`memo`·스냅샷 컬럼, 시세/지연 상태 등 | Contract 가 확정한 만큼 |

규칙:
- 버전 값은 `PRAGMA user_version` 과 `schema_version` 의 최대 `version` 이 같아야 한다. 불일치는 손상으로 취급한다.
- 각 버전 마이그레이션은 **하나의 트랜잭션**이며, 시작 전에 DB 파일을 백업한다(`stockbook.db.pre-vN`).
- **다운그레이드 마이그레이션은 만들지 않는다.** 되돌리기는 마이그레이션 전 백업 복원이다.
- 앱이 모르는 더 높은 `user_version` 을 만나면 쓰기를 거부하고 읽기 전용 + 안내를 띄운다(구버전 EXE 가 새 DB 를 망가뜨리지 않게).
- v1 안에서 컬럼 추가가 필요하면 새 버전을 올린다. `extra_json` 은 임시 수용용이며 계약이 된 필드는 컬럼으로 승격한다.

## 6. JSON → DB 이전, 완료 판정, 저장 실패, 롤백 경계

### 6-1. 이전 순서 (구현 시)

1. **상태 판정**(§6-4 표). 이전이 필요하면 아래를 진행한다.
2. JSON 읽기·파싱. 실패하면 중단(JSON 을 건드리지 않고, 앱은 현행 방식으로 시작하며 안내).
3. **원본 보존:** `stockbook-data.backup-YYYYMMDD.json` 으로 복사하고 크기와 SHA-256 을 원본과 비교한다. 이름이 이미 있으면 접미사를 붙이며 기존 백업을 덮어쓰지 않는다.
4. 임시 파일 `stockbook.db.tmp`(저널 모드 `DELETE`)에 스키마 v1 을 만들고 **한 트랜잭션**으로 전체 이전한다. id 가 없는 레거시 기록은 이때 UUID 를 받고(`seq` = 배열 순서), 값은 §4-5 규칙으로 넣는다. 같은 트랜잭션 안에서 `settings['migration.json_import']` 를 `{"status":"importing", ...}` 로 쓴다.
5. **검증(필수):** ① 테이블별 건수 = 레거시 배열 길이 ② 금액·수량 합계 일치 ③ §4-5-9 의 깊은 비교 ④ `integrity_check`, `foreign_key_check`.
6. 통과하면 마커를 `completed` 로 갱신(별도 작은 트랜잭션): 원본 JSON 의 크기·SHA-256, 백업 파일명, 건수, 앱 버전, `completed_at`, `first_write_at: null`.
7. 연결을 닫고(`-wal`/`-shm` 이 남지 않게) `.tmp` → `stockbook.db` **원자적 rename**. 다시 열어 `quick_check` 후 `journal_mode=WAL` 로 전환.
8. 실패 시 `.tmp` 를 삭제하고 **JSON 이 계속 현행 저장소**다. 실패 사유·앱 버전을 `userData/stockbook.migration-failed.json` 에 기록해 같은 앱 버전에서 무한 재시도를 막는다(다음 앱 버전에서 재시도, 사용자 수동 재시도는 허용).

### 6-2. 단계별 되돌림 요약 (상세는 §6-6)

| 상황 | 동작 |
|---|---|
| 이전 중 실패·검증 실패·크래시·디스크 부족 | `.tmp` 폐기, JSON 유지. 원본을 건드리지 않았으므로 손실 없음 |
| 이전 직후 DB 가 열리지 않거나 `integrity_check` 실패 | §6-6 B/C 경로 |
| 버전 N 마이그레이션 실패 | 트랜잭션 롤백으로 N-1 상태 유지 → 쓰기 중단 + 안내 → `stockbook.db.pre-vN` 복원 제안 |
| 사용자가 직접 복원 | #30 복원 기능(스냅샷). `assets` 매핑 포함 필수(§7) |

### 6-3. 이전 후 JSON 과 localStorage 의 처리

- **원본 JSON 백업(승인):** 이전 시점의 `stockbook-data.json` 은 삭제·수정하지 않고, 백업 사본을 별도로 남긴다.
- **SQLite 단일 기준(D5, Electron):** `save()` 가 localStorage 에 더 이상 쓰지 않는다. 이전 후 기존 localStorage `stockbook_v1` 은 **낡은 사본**이므로, 렌더러 `load()` 의 ① 단계(localStorage 즉시 렌더)가 이를 보여 주지 않도록 Electron DB 모드에서는 이 단계를 건너뛰고 `push-state` 한 번으로 로드를 통합한다(구현 단계에서 렌더러 변경 최소화 방안 확정). 브라우저(Pages)는 기존 저장 방식 유지(D7).
- **섀도 JSON 폐기(D4 확정, 2026-10-10):** 이전 후 JSON 을 갱신하지 않는다. 기존 `stockbook-data.json` 은 **이전 시점의 원본 백업으로만** 보존하고(§6-1 3단계의 `stockbook-data.backup-*.json` 포함), SQLite 전환 후에는 **SQLite 가 유일한 기준 저장소**다. 두 저장소가 달라지는 상황은 설계에서 제거됐다.
- **별도 기능(이 이슈 범위 밖):** SQLite 스냅샷 백업(#30)과 사용자의 명시적 JSON 내보내기는 복구·이식을 위한 별도 기능이며, 정상 저장소가 아니다.
- 영향: 구간 B 의 재이전은 "JSON 저장으로 돌아가는 것"이 아니라 **검증된 원본 JSON 으로 SQLite 이전을 다시 수행**하는 것이다(§6-6). 구버전 앱 복귀 시 데이터 분기 위험은 줄지 않고 그대로 남는다(§6-6, §12).

### 6-4. 이전 완료 판정과 중복 이전 방지

**이전 완료의 정의.** 다음이 **모두** 참일 때만 "완료"다.
1. `stockbook.db` 가 존재한다.
2. `PRAGMA user_version` ≥ 1 이고 `schema_version` 의 최대 버전과 같다.
3. `settings['migration.json_import']` 의 `status` 가 `completed` 이다(이전 트랜잭션 안에서 만들어진 값이라 DB 와 분리되어 사라질 수 없다).
4. 시작 시 `quick_check` 가 `ok` 이다.

**시작 시 상태 판정표:**

| # | DB | 마커 | JSON | `.tmp` | 판정과 동작 |
|---|---|---|---|---|---|
| 1 | 없음 | — | 없음 | — | **최초 실행.** 빈 DB 생성, 마커를 `{status:completed, source:null}` 로 기록 |
| 2 | 없음 | — | 있음 | 없음 | **이전 수행**(§6-1) |
| 3 | 없음 | — | 있음 | 있음 | 이전 중 중단된 잔재. `.tmp` 를 신뢰하지 않고 삭제 후 2 와 같이 재이전 |
| 4 | 있음 | completed | (무관) | (무관) | **정상.** JSON 이 있어도 **다시 가져오지 않는다**(DB 가 기준). 로그에 "JSON 무시"만 남김 |
| 5 | 있음 | 없음·importing·불일치 | (무관) | (무관) | **손상 취급.** DB 를 덮어쓰거나 삭제하지 않고 `stockbook.db.corrupt-<시각>` 으로 **격리(rename)** 후 §6-6 복구 |
| 6 | 있음 | completed | — | — | `quick_check` 실패 → 5 와 같음 |
| 7 | 있음 | completed | — | — | `user_version` 이 앱이 아는 것보다 높음 → **읽기 전용 + 안내**(구버전이 새 DB 를 쓰지 않음) |

**중복 이전 방지 장치:**
- 마커 `completed` + DB 존재가 "이미 이전함"의 단일 근거다. 같은 JSON 으로 두 번째 이전이 일어나려면 DB 가 없어야 한다.
- `.tmp` → DB 는 **원자적 rename** 이므로 반쯤 만들어진 `stockbook.db` 가 존재할 수 없다.
- **동시 실행 방지가 현재 없다.** `main.js` 에는 `app.requestSingleInstanceLock()` 이 없어 같은 `userData` 를 두 인스턴스가 열 수 있다(확인함). 이전 구간과 쓰기 경합을 막기 위해 **단일 인스턴스 잠금을 구현 선행 조건**으로 둔다. (SQLite WAL 은 다중 프로세스 쓰기를 직렬화하지만 이전 구간은 보호하지 못한다.)
- 격리·백업 파일은 자동 삭제하지 않는다.

### 6-5. 이전 성공 이후 저장 실패

대상 사례: 디스크 부족(`SQLITE_FULL`), 외부 프로세스 잠금(`SQLITE_BUSY`/`LOCKED`: 백신·클라우드 동기화·백업 소프트웨어), 읽기 전용 경로, I/O 오류, 제약 위반(중복 id·`CHECK`), 변환 중 예외(예상 밖 데이터 형태).

원칙:
1. **저장은 한 트랜잭션.** 실패하면 직전 커밋 상태가 그대로 남는다(부분 반영 없음).
2. **"마지막 저장 실패" 상태를 어댑터가 기억**하고 직전 payload 중 **최신 1건**만 보관한다(전체 상태 방식이라 최신만 있으면 된다). 다음 `save-state` 가 오면 새 payload 로 재시도하고, 앱 종료 시에도 한 번 재시도한다(`before-quit` 훅은 현재 없음 — 구현 선행 항목). **종료 훅은 보조 수단이다.** 강제 종료(프로세스 kill·전원 차단·크래시)에서는 실행되지 않으므로, 마지막 커밋 상태로의 복구는 WAL 과 트랜잭션이 보장해야 하며 어떤 보장도 종료 훅에 의존하지 않는다.
3. **반환값 확장.** `save-state` 의 `true/false` 를 `{ok, code, retryable}` 로 확장한다(렌더러가 무시해도 호환). 렌더러는 연속 실패가 일정 횟수를 넘으면 **비차단 알림**을 띄우고 설정 허브의 데이터 관리에 상태를 표시한다.
4. **비상 덤프.** 재시도가 계속 실패하거나 재시도 불가 오류(제약 위반 등)면 `userData/unsaved/stockbook-unsaved-<시각>.json` 에 최신 payload 를 기존 JSON 형식으로 쓴다. 이것은 **복구용 사본**이지 정상 저장소가 아니다(기준 이중화 방지). 보관은 최신 N 개.
5. 제약 위반은 재시도해도 결과가 같으므로 즉시 비상 덤프하고 오류 코드를 남긴다(코드 결함 신호).
6. **이전 완료 판정에는 영향이 없다.** 마커는 이전 트랜잭션에서 이미 커밋됐다. 이전 직후 첫 저장이 실패해도 상태는 "이전 완료, 첫 쓰기 없음"(`first_write_at: null`)이다.
7. 저장이 실패하는 동안 화면은 정상으로 보이므로 **사용자에게 보이게 하는 것이 필수**다(조용한 실패 금지).

### 6-6. 롤백 경계 — 되돌릴 수 있는 지점과 없는 지점

`first_write_at` = 이전 이후 **첫 사용자 저장**(변경된 행이 있는 첫 커밋)의 시각으로 마커에 기록한다.

| 구간 | 자동 되돌림 | 방법 | 데이터 손실 |
|---|---|---|---|
| **A.** SQLite 전환 완료 전(이전 중·검증 실패·크래시) | 자동·완전 | `.tmp` 폐기, 원본 JSON 을 보존하고 **기존 JSON 저장 방식으로 계속 동작** | 없음 |
| **B.** 전환 완료 후 첫 DB 쓰기 전(`first_write_at` = null) | 자동 가능 | 전환 결과가 유효하지 않으면(DB 손상·검증 실패) 격리 후 **검증된 원본 JSON 으로 SQLite 이전을 다시 수행**한다. JSON 저장으로 돌아가 계속 쓰는 것이 아니다. 마커의 SHA-256 과 현재 JSON 이 같을 때만(원본이 변하지 않았음을 증명) | 없음 |
| **C.** 첫 DB 쓰기 이후 = **되돌림 불가 지점** | **자동 롤백 없음** | 저장 오류나 DB 손상 시 **쓰기를 중단하고 오류를 알린 뒤**, 검증된 백업(이전 직전 원본 JSON 백업 또는 #30 스냅샷)이나 비상 덤프로 **명시적으로 복원**한다. "선택한 시점 이후의 변경은 사라진다"는 안내와 확인 후에만 수행. 손상된 DB 는 격리 보관 | 있음(복원 시점 이후) |

- 이후 버전 N 마이그레이션도 같은 경계를 쓴다: 시작 전 `stockbook.db.pre-vN` 백업, 실패 시 트랜잭션이 N-1 로 되돌리고 앱은 쓰기를 중단한다(읽기 전용 + 복원 제안).
- **모든 구간 공통:** 데이터 무결성 검증과 원본·백업·복구 자료의 보존이 필수다. 어떤 경로도 원본 JSON, 백업, 격리된 DB, 비상 덤프를 임의로 삭제하거나 덮어쓰지 않는다. 복구 결과도 무결성을 검증한다(§4-5 규칙, `integrity_check`).
- **구버전 앱으로 복귀(다운그레이드):** JSON 기반의 구버전은 DB 를 알지 못하고 **이전 시점의 원본 JSON** 만 읽는다(D4 로 섀도 JSON 이 없으므로 이후 변경은 반영되지 않는다). 이전 이후 구버전으로 돌아가면 DB 에 쌓인 변경을 보지 못하고 새 JSON 을 따로 쓰게 되어 **데이터가 갈라진다.** 릴리스 노트로 알리고 구버전 복귀를 지원 경로로 두지 않는다. (§6-4 7번의 "미래 `user_version` 이면 읽기 전용"은 *신버전 DB 를 더 낮은 DB 지원 버전이 건드리지 않게* 하는 규칙이며, JSON 기반 구버전과는 다른 문제다.)
- "자동 롤백 없음"은 의도다: C 구간에서 자동으로 JSON 으로 돌아가면 JSON 은 최신 상태가 아니므로 이전 이후의 사용자 입력이 사라진다.

## 7. #49·#30 수용 구조

- **시계열(#49):** 사용자 DB 와 **파일을 분리한 `market.db`**(권고, D6). 일봉은 다시 받을 수 있는 데이터(`data` 브랜치 일일 JSON, #31)라 백업에서 제외하고, 사용자 DB 의 크기를 작게 유지한다. `assets.asset_id` 를 참조하는 `candle(asset_id, date, o,h,l,c,volume, trading_value, …)` 형태를 후보로 하며 종목 참조 키의 크기(UUID 문자열 36B × 100만 행 ≈ 36MB 추가)는 #49 에서 `assets` 의 정수 대리키 도입 여부와 함께 결정한다. 위 벤치마크는 정수 키 기준이다.
- **백업(#30):** 사용자 DB 스냅샷은 SQLite 의 온라인 백업(`VACUUM INTO` 또는 백업 API)으로 일관된 파일을 만든다. **`assets` 테이블 포함이 필수**다 — 매핑이 사라지면 JSON 에서 재이전할 때 UUID 가 다시 발급되어 관계가 끊긴다. API 키 파일은 제외(현행 규칙 유지).

## 8. UI 상태와 데이터 요구 (UI 설계 지침 v1 ↔ #29·#47·Contract Gate)

화면 상태를 지원하려면 데이터 계층에서 다음이 필요하다. 이 문서의 v1 이 이미 지원하는 것과 후속 단계로 넘기는 것을 구분한다.

| UI 상태 | 데이터 요구 | v1 지원 | 해소 단계 |
|---|---|---|---|
| **최초 실행** (관심·보유·일지 없음) | 빈 DB 와 "이전할 JSON 없음"을 구분, 테이블별 0건 판정 | ✅ (§6-1 1단계, 건수 조회) | #29 |
| **종목 식별 미해결** | `asset_id IS NULL` 레코드 목록, 연결 후 보존 | 구조 ✅ (`asset_id` nullable) / 연결 로직은 ❌ | #47 |
| **데이터 부족** (이동평균·신호 판정 불가) | 종목별 일봉 개수·기간 조회, `INSUFFICIENT_DATA` 규칙 | ❌ (시계열 없음) | #49 + Contract(데이터 부족 처리) |
| **오프라인** (마지막 저장 데이터 표시) | 각 시세·일봉에 **기준 시각(`as_of`)과 `priceType`** 저장 | ❌ (`holdings.current_price` 에 시각 없음) | Contract(`timestamp`/`priceType`) + #48/#49 |
| **갱신 실패** (기준 시각·재시도) | 출처별 마지막 시도/성공 시각, 마지막 오류 | ❌ | Contract + #48 Provider (후보 테이블 `data_source_status`, D11) |
| 일지 빠른 기록 vs 전체 일지 | `kind` 구분, 거래와 혼동 금지 | 구조 ✅ (§4-3) | Contract(빠른 기록 규격) |

참고: "기준 시각 없는 현재가"가 이미 레거시 데이터에 있다(`portfolio.currentPrice`, `watchlist.price/change`). v1 은 보존만 하고 의미를 부여하지 않는다. 신선도 표시는 Contract 의 `timestamp`·`priceType` 결정 뒤에 스키마를 올린다.

## 9. Contract Gate·Android 와의 접점

- 이 스키마는 **계약이 아니라 PC 저장 모델 v1**이다. Contract 가 확정되면 v3 이후 마이그레이션이 정규화한다. 단 컬럼 의미는 SQLite 표준 DDL 이라 Android(Room)가 같은 표를 구현할 수 있다.
- Contract Gate 로 넘기는 결정: 통화·최소단위, 반올림, `changeRate` 단위, `timestamp`/`priceType`, 데이터 부족 처리, 이벤트 중복 방지 키, **일지 `kind`·자동 첨부 스냅샷 규격**, 평균단가 계산 규칙.
- #47 로 넘기는 결정: 종목 식별 규칙 6개(이슈 본문), `assets` 채우기, `stockCode` 변경 이력.
- 멀티 디바이스에서의 `assetId` 일치는 이 단계 범위 밖이다(동기화 설계).

## 10. 검증 계획 (구현 시 #29 완료 조건과의 대응)

| #29 완료 조건 | 검증 방법 |
|---|---|
| SQLite 스키마 확정 | 이 문서의 DDL + 레거시 필드 전수 매핑표(컬럼 또는 `extra_json`) 리뷰 |
| `schema_version`·migration 경계 | §5 규칙 단위 테스트(버전 불일치·미래 버전 거부) |
| #49 시계열 수용 | `market.db` 분리 설계 + 규모 벤치(§2-2) |
| 모든 레코드 `id`/`createdAt`/`updatedAt` | 이전·신규 저장 후 NULL/중복 검사 |
| `assets`·`asset_id` 선정의 | DDL 시험(§4-2) |
| Shared Contract 대응 가능 | 컬럼 의미 표 + Contract 결정 목록(§9) |
| Android 재현 가능 | 표준 DDL만 사용, `STRICT`/확장 미사용 — Room 매핑은 Android 단계에서 확인 |
| IPC 가 계약이 되지 않음 | 어댑터 경계(§3-1), 레거시 IPC 임시 표기 |
| 관심종목 경로 통합 | §1-4 규칙, 이행 픽스처(§10-1) |
| 이전 검증 | §10-1 픽스처 + 왕복 동치성(§4-5 규칙 전체) |
| 실패/rollback 검증 | §10-2 장애 주입 + §6-4 상태 판정표 7행 + §6-6 구간 A/B/C |
| 레코드 id·asset_id 불변 | §4-2 트리거 시험, 중복 id 픽스처 |
| 저장 시간 기준선 | #25 기준선 대비 측정(데이터 규모별) |

### 10-1. 마이그레이션 픽스처 (구현 시)

빈 상태 / 소규모 실제형 / 이름만 있는 거래·일지 / `ticker` 없는 보유·관심 / 동명 종목 / 그룹 이름이 같은 관심종목 / `sb_watchlist_v1` 만 있는 레거시 / 알 수 없는 추가 필드 / 큰 데이터(10만 건) / 한글·이모지·긴 메모 / 손상 JSON / 잘린 JSON(쓰는 도중 종료) / 배열 순서(`unshift`) 보존. **§4-5 전용 픽스처:** 숫자여야 할 필드의 문자열(`"3"`), 문자열이어야 할 필드의 숫자(`5930`), 선행 0 종목코드(`"005930"`), 키 없음/`null`/`""`/`0`/`false` 의 구분, 빈 배열 vs 키 없음, 짝 없는 서로게이트·NUL·이모지, `1e21`·`0.1+0.2`, 알 수 없는 레코드 키와 알 수 없는 최상위 키, 같은 `id` 가 두 번 나오는 배열, 이미 `id` 가 있는 레코드. 모든 픽스처에서 왕복 동치성과 **2회 실행 시 동일 결과(멱등)**, DB → 상태 → DB 재저장 시 변경 행 0.

### 10-2. 장애 주입

이전 중 프로세스 종료(커밋 전/후, rename 직전·직후), 디스크 부족(임시 파일 쓰기 실패), 읽기 전용 경로, `.tmp` 가 이미 존재, DB 파일 일부 손상, 마커 없는 DB, 미래 `user_version`, 한글 사용자 경로, **이전 직후 첫 저장 실패**, 저장 반복 실패 후 비상 덤프 생성, 같은 JSON 으로 두 번째 이전 시도(거부 확인), 두 인스턴스 동시 실행. 모든 경우에서 **JSON 원본이 유실되지 않고 앱이 시작되는지** 확인한다.

## 11. 결정과 처리 결과 (2026-10-10)

| # | 결정 | 처리 결과 |
|---|---|---|
| D1 | 드라이버 | **확정(2026-10-10): `better-sqlite3` 12.11.1, `<13` 고정. `sql.js` 불채택.** Windows 스파이크(run 38026482159, 커밋 `1d2ddca`) 필수 11/12 통과, 실패 1건은 입력 보존 규칙 문제(§2-4, §4-5 규칙 6). 저장 계층 구현은 별도 승인 |
| D2 | id 부여 지점 | **승인.** 렌더러 `save()` 의 `_ensureIds` 에서 레코드 UUID 부여, **기존 id 보존**(§3-4) |
| D3 | 삭제 방식 | **승인.** 소프트 삭제(`deleted_at`) |
| D4 | 이전 후 JSON | **확정(2026-10-10): 섀도 JSON 폐기.** 기존 JSON 은 이전 시점 원본 백업으로만 보존, SQLite 가 유일한 기준 저장소. SQLite 스냅샷 백업·명시적 JSON 내보내기는 별도 기능 |
| D5 | Electron 이중 저장 | **승인.** Electron 은 SQLite 단일 기준, 브라우저는 기존 저장 방식 유지 |
| D6 | 시계열 DB | **승인.** `market.db` 분리 |
| D7 | 브라우저 저장소 | **승인.** 브라우저 localStorage 유지, #29 의 IndexedDB 문구 수정 |
| D8 | 숫자 타입·통화 | **승인.** v1 은 레거시 `REAL` 보존, 정규화는 Contract 이후 |
| D9 | 일지 `watch`/`memo` | **승인.** 구조만 v1, 행·자동 첨부 스냅샷은 Contract Gate |
| D10 | 평균단가 | **승인.** v1 저장값 보존, 계산 규칙은 Contract/규칙 엔진 |
| D11 | `data_source_status` | **승인.** v1 에 넣지 않고 #48 Provider 와 함께 설계 |

### 구현 착수 전 선행 조건 (구현 승인 시 함께 확인)

1. #55 정책 반영(머지) 확인
2. ~~D1 Windows 스파이크 결과 보고와 드라이버 최종 확정~~ → 완료(§2-4)
6. **저장 계층 구현 승인**(별도 결정, 이 문서 PR 과 #57 정리 후)
3. ~~D4 섀도 JSON 정책~~ → 확정(폐기)
4. 단일 인스턴스 잠금(§6-4)과 `before-quit` 훅(§6-5)은 저장 계층 구현의 선행 작업
5. `index.html` 의 `state` 대입·변경 지점 전수 조사(§12)

## 12. 위험·한계·미검증

- **Windows 빌드: 스파이크로 검증됨**(§2-4). 남은 한계: 러너는 CI 환경이며 사용자 PC(백신·OneDrive 동기화 폴더·네트워크 드라이브 등)에서의 동작은 검증하지 않았다. 코드 서명 없이 패키징했다.
- Electron 31.7.7 의 번들 Node 는 20.18.0 으로 실측했다(§2-4).
- 벤치마크는 Linux·Node 22·합성 데이터이며 `sql.js` 의 메모리 수치는 측정이 불안정해 싣지 않았다. 실제 사용자 데이터 규모는 알지 못한다(추정: 수백~수천 건).
- §4-5 의 SQLite 동작 표는 `better-sqlite3` 13.0.3(Linux, Node 22)에서 확인했다. 12.11.1(Electron 31, Windows)에서는 스파이크가 같은 표를 재확인했고 서로게이트 한 건만 달랐다(§2-4). 구현 시에는 이 표 전체를 자동 시험으로 유지한다.
- 레거시 필드 전수 매핑표는 코드의 `push`/`unshift` 지점 기준이며, 사용자가 과거 버전에서 저장한 임의 필드는 `extra_json`·`settings` 로 보존하는 규칙(§4-5)에 의존한다.
- `better-sqlite3` 가 동기 API 라 큰 이전 작업은 창 표시 전에 해야 한다. 이전에 걸리는 시간은 데이터 규모별로 구현 시 측정한다.
- 이 문서는 `index.html` 의 모든 `state` 쓰기를 전수 확인한 것이 아니다. 구현의 첫 작업으로 `state.*` 대입·변경 지점 전수 조사를 포함한다.
- 현재 앱에는 단일 인스턴스 잠금과 종료 훅이 없다(§6-4, §6-5). 저장 계층의 안전성이 이 두 가지에 의존한다.
- 구버전 앱으로 복귀하면 데이터가 갈라진다(§6-6). D4 로 섀도 JSON 을 폐기했으므로 구버전은 이전 시점의 원본 JSON 만 읽는다. 지원 경로로 두지 않고 릴리스 노트로 알린다.
- 비상 덤프(§6-5)와 시점 복원(§6-6 C)의 사용자 화면은 UI 설계(GPT 담당) 범위이며 이 문서는 데이터 요구만 정한다.

## 부록. 측정 방법

임시 디렉터리에서 `better-sqlite3`(WAL, `synchronous=NORMAL`)와 `sql.js` 를 설치해 합성 거래/일봉 데이터로 측정했다. 현행 방식은 `JSON.stringify(state)` + 임시 파일 쓰기 + rename. 저장소에는 벤치마크 스크립트를 커밋하지 않았다(이 브랜치는 문서만 포함).
