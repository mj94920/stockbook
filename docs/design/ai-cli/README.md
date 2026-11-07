# StockBook 분석 규칙·기업 리서치·HOME 연결 준비

## 사용자 결정

- Codex·Claude CLI 로그인은 HOME에서 이미 완료돼 있다. StockBook에서 CLI를 다시 설치/로그인하거나 인증 파일을 읽어 복사하지 않는다.
- HOME의 기존 연결·모델 선택·사용량을 재사용한다. StockBook은 분석 규칙과 공개 시장 근거를 전달하고 구조화된 결과를 받는다.
- 종합 화면 AI 분석과 기업 리서치(수집 자료·출처·기준일) 페이지를 분리한다. 전종목 버튼은 `리서치`로 변경한다.

## 구현한 StockBook 측 기능

- `src/ai/policy.js`: 종목·장전·마감·주간·월간·분기·연간 7개 패턴. 데이터 우선, 해석/가설 구분, 원칙·판단 이유 우선, 사용자 선택지와 재검토 조건, 누락자료 명시.
- `research.cjs`: 공개 업종·기본정보, 실제 일봉, 연간 재무, 최신 20건의 종목뉴스를 수집. 1/3/12개월은 시세·뉴스 범위이며 재무 결산기간과 분리한다. 재무 예상치·공급자 단위 누락을 구분한다.
- 일/주/월/년 지표는 기존 코드의 기본 기간으로 계산. 사용자 변경 설정, 미확정 RSI, 피보나치, 실제 거래대금·수급 및 미연결 신호를 추측하지 않는다.
- `service.cjs`: main 창/프레임 확인, 입력 검증, 공개 근거만 전달, 단일 분석, 취소/시간제한, 요청 ID/종목/모델 일치 및 결과 근거 ID 검증. 원시 HOME 오류나 인증 정보를 렌더러에 전달하지 않는다.
- `client.js`: HOME 연결 확인, 모델 선호·패턴·기간 선택, 수동 분석 요청, 선택지·위험·미수집 표시. 기업 리서치에는 분석 문장을 섞지 않는다. 종목 변경 후 지연 응답을 무시한다.
- 웹에서는 CLI/API 인증을 직접 시도하지 않고 데스크톱 연결 필요를 표시한다.

## HOME 연결: 아직 바인딩하지 않음

현재 `main.js`는 `registerAI`에 HOME 어댑터를 주입하지 않는다. 따라서 UI는 **홈 연동 경로 미등록**이라고 표시하며 실제 모델 요청을 하지 않는다. 이는 HOME의 CLI 미설치나 로그인 실패를 의미하지 않는다. 인증·모델 호출 실기 성공으로 기록하지 않는다.

사용자 지정 최신 소스:

- `C:\Users\mj949\I-Character-Project-home-github-stable-20261101`
- 로컬 브랜치 `dev/home-unified-20261103`
- `desktop-pet/src/engine/{codex-adapter.js,claude-adapter.js,runtime.js,auth.js}`
- `desktop-pet/shell/electron/main.cjs`

현재 Linux 작업환경에는 이 Windows 폴더가 마운트돼 있지 않다. GitHub `main` SHA `db3bd1a157b0b01e47a09c681aca9b17a9af7cce`를 보조 확인했으나 지정 브랜치는 원격에 없고 `auth.js`는 해당 SHA에서 404다. 이 소스로 최신 HOME 연동 규격을 단정하거나 로컬 변경을 덮어쓰지 않는다.

확인한 GitHub main의 Electron IPC는 HOME/Workspace 소유 webContents로 제한돼 있다. 별도 Electron 앱인 StockBook이 그대로 호출할 공개 통신 경로라고 간주할 수 없다. 현재 runtime 어댑터는 캐릭터 응답 스키마를 사용하므로 Stock 작업 계약의 호환 여부도 최신 소스로 확인해야 한다.

## StockBook 쪽 어댑터 포트 (HOME 공개 프로토콜이라고 확정한 것이 아님)

`registerAI({ home })`가 기대하는 주입 인터페이스:

- `status()` → `{providers:[{id:'codex'|'claude',connected:boolean}]}`. 인증 토큰·이메일·키 파일·계좌 정보 반환 금지.
- `analyze({requestId,code,mode:'stock',provider:'auto'|'codex'|'claude',pattern,prompt,schema,signal})` → `{requestId,code,provider,result}`.
- `cancel(requestId)` → 실제 취소 확인 시에만 `true`. 원격 실행이 계속될 수 있는 경우 UI도 확정 취소로 표시하지 않는다.

최신 HOME 구현의 인증·스케줄러·모델 라우터·한도 확인을 재사용하는 어댑터가 필요하다. 임의 localhost 포트, 무인증 HTTP 서버, 로그인 파일 공유, 새 CLI 실행기나 자동 재로그인을 만들지 않았다. 실제 통신 형식과 인증 방법은 최신 HOME 소스 확인 후 구현해야 한다.

## 남아 있는 데이터 연결

현재 공개 종목자료로 먼저 동작한다. 세계 시장/M7/미 10년물 금리/상위20/사용자 계획·행동·포트폴리오·원칙 기록/분기 실적/FCF 원본은 미연결이다. 해당 패턴은 누락 항목을 반드시 표시하며, 패턴의 필요한 자료가 전혀 없으면 모델 요청을 하지 않는다. 사용자 사유나 자기평가를 대신 생성하지 않는다.

연간 재무에 단위 필드가 없으면 단위 확인 필요로 표시한다. 추정 재무를 실제 결산값으로 표시하지 않는다. 뉴스는 최신20건 중 기간 내 자료이며 기간 전체 뉴스 전수 조사가 아니다.

## 실기 및 검사 구분

- 실제 공개 공급자 수집: 삼성전자 1,000일봉, 재무 16개 항목, 종목뉴스 20건, 기본정보·업종 수신 확인. 개인 API/계좌 사용 없음.
- Codex CLI 0.163.0 도움말·로그인 명령, 임시 다운로드한 공식 Claude Code 2.1.319 도움말·미로그인 상태 조회를 확인. HOME의 로그인 상태나 유료 분석 성공 증거가 아니다.
- 자동 테스트의 HOME 응답은 주입한 테스트 어댑터이며 실제 HOME 연결·OAuth·CLI 모델 호출의 실기 검증이 아니다.
- Windows HOME 로그인 재사용·실제 모델 응답 실기: 최신 로컬 소스 확인 후 진행 필요.
- EXE 빌드·배포·병합은 실행하지 않는다.

최종 `npm test`: 정적 검사, 전체 107개 단위·브라우저 검사, 기존 스모크 통과. `public-research-live.json`은 실제 공개 데이터 수신 요약이며, `research-browser-mock.png`는 UI 검사용 합성 자료 화면이다. HOME OAuth 또는 실제 모델 실행 성공으로 해석하지 않는다.

이 브랜치는 업종 분류 작업 `3ef18da`에 의존하며, HOME 연결 부분은 최신 로컬 소스가 필요한 검토 초안이다. 기존 캐릭터의 `text / emotion / action` 계약을 StockBook 스키마로 덮어쓰지 않는다.
