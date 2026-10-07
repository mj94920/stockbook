# Stockbook × Desktop Character 로컬 목업

Stockbook의 `index.html`을 그대로 실행하고 추가 스크립트만 로드한다. 본체 HTML/CSS/JS, main/preload, 기존 테스트 및 Claude 도킹 레이아웃을 수정하지 않는다. 별도 디자인 시스템이나 복제된 금융 화면은 없다. `.sb-btn/.sb-input/.sb-select/.sb-stat`, `--sb-*` 토큰을 그대로 사용한다.

## 실행

저장소 루트에서 의존성을 설치한 후 PowerShell:

```powershell
npm ci
$env:CHARACTER_PROJECT = 'C:\경로\I-Character-Project'
node agent/preview.mjs
# http://127.0.0.1:4173/agent.html
```

브라우저: 현재 origin에 저장된 데이터 조회. 전종목 네트워크 조회는 기존 Stockbook처럼 Electron에서 지원한다. 임의 계좌/보유/관심 데이터는 주입하지 않는다. `CHARACTER_PROJECT`를 생략하면 도구 패널만 실행한다.

Electron: 원본 main/preload와 IPC를 재사용한다. 별도 프로필 `%APPDATA%\StockBook-Agent-Preview`를 사용하므로 독립 Stockbook의 저장 파일을 덮어쓰지 않는다. 기존 데이터는 Stockbook의 데이터 복원 UI로 명시적으로 가져온다. 기본 로그인 화면은 기존 취소 버튼으로 닫는다.

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx electron agent/launch.cjs
```

개발 실행 전용이며 NSIS 패키지/자동시작/독립 투명 캐릭터 창 배포는 이번 목업에 포함되지 않는다.

## 실제 재사용 지점

| 도구 | 기존 구현 | 동작 |
| --- | --- | --- |
| `watchlist` | `state.watchlist`, `renderWatchlist()` | 현재 관심종목과 기존 레거시 마이그레이션 |
| `accounts` | `state.accounts`, `state.portfolio` | 계좌별 보유 분리, 계좌 미지정 보유 표시, 계좌번호 제외 |
| `summary` | `calcAssetSummary()`, `getCashBalance()` | 본체와 동일 손익/수익률/예수금; 현재가 없는 건수와 평균단가 폴백 명시 |
| `search` | `_allStockRaw`, `loadAllStocks()`, `filterAndRenderAll()` | 실제 KOSPI/KOSDAQ 데이터의 이름/코드/업종 검색; 시총 1,000억 기준, 결과 30개 제한 |
| `detail` | `openAllStockPopup()` | 목록에 있는 국내 숫자 6자리 코드의 기존 상세 팝업 |
| `show` | `_MDI.open`, `_MDIPanelTab`, `openAccountPanel` | 기존 관심·보유·계좌·전종목 화면으로 연결 |

호출 계약: `await window.stockbookAgent.call('summary')` → `{ok, tool, data}` 또는 `{ok:false, tool, error}`. 허용 목록 밖 도구는 거절한다. 계좌 동기화·거래·삭제·API 키 도구는 노출하지 않는다. 결과는 LLM 서버로 전송하지 않는다.

## 실제 캐릭터 연결

사용자가 지정한 I-Character-Project의 `desktop-pet/src/agent.js`에서 `DesktopPetAgent`를 직접 import한다. 공용 `CharacterCore` 및 `createAgentResponse`의 `text/emotion/action` 계약과 allow-list 검증을 유지한다. 로컬 Provider가 “관심종목”, “계좌·보유”, “내 평가손익은?”, “삼성 검색”을 위 도구로 연결한다. 자유로운 LLM 의도 추론은 아직 아니며, 지원하지 않는 문장은 가능한 요청을 안내한다.

원본 아린 스프라이트의 neutral/notice/sleepy 프레임을 로컬 경로에서 읽는다. 캐릭터 소스·PNG·키·캡슐은 이 공개 저장소에 복사하지 않는다. 로컬 서버는 명시한 7개 코어 모듈과 3개 이미지 외에는 캐릭터 저장소 파일을 제공하지 않는다. 타이머·상태 수명주기는 기존 Core에 맡기고 페이지 종료 시 `close()`한다.

검사 기준: Stockbook main `c8dd7bc`, Agent 초기 `d63441f`, PR #42 `fbf0866`, I-Character-Project `bbbbe0e`. PR #36이 아니라 UI2 이슈 #36이다. Agent 변경은 PR #45에 누적하며 PR #42는 병합하지 않는다.

## 검증

```powershell
npm run test:setup
npm test
node agent/test.mjs
# CHARACTER_PROJECT 설정 시 실제 캐릭터 코어/이미지/요청도 검증
node agent/test-electron.mjs
```

- 본체 정적 검사 및 브라우저 스모크 통과.
- Agent 브라우저 검사: 빈 데이터, 데이터 부족/잘못된 요청, 복수 계좌 보유, 손익 +200 / 총자산 2,700 / 수익률 10% 독립 기대값, 코드·업종·결과 없음, 원본 패널/상세, 테마 및 1400×900/1024×768, 런타임 오류 0건.
- 동일 검사를 PR #42의 HTML에 적용해 통과. `AGENT_INDEX`로 별도 HTML 경로를 지정하며 PR 파일을 수정하지 않는다.
- Electron에서 실제 DesktopPetAgent 및 이미지 로드, 정상 프로토콜, contextIsolation 유지, nodeIntegration 비활성화, 기존 IPC의 KOSPI “삼성” 검색 성공(검증 당시 37건).
- 테스트의 합성 데이터는 일회성 브라우저 컨텍스트에만 존재한다. 실행 목업에는 샘플 자산을 넣지 않는다. 계좌 API 인증 및 실제 KIS 보유 동기화는 검증하지 않았다.

브라우저 스크린샷은 `smoke-shots/agent`에 저장되며 커밋하지 않는다. 캐릭터 자산을 포함한 캡처 역시 로컬 확인용이다.

## 원본 피드백

PR #42에 `Agent integration note`를 남겼다. `dockCtxRender()`의 `h.price`와 본체 `currentPrice` 필드 차이, 동일 ticker 복수 계좌 보유에서 첫 항목만 사용하는 정합성 문제를 재현 예와 함께 전달했다. 이 목업은 본체 계산을 그대로 호출한다.
