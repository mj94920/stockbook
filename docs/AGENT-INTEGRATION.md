# Stockbook × Desktop Agent 통합 작업선

이 문서는 독립 제품으로 개발되는 `stockbook` 본체와, 데스크톱 캐릭터 에이전트에서 Stockbook 기능을 재사용하는 통합 작업을 분리해서 관리하기 위한 기준이다.

## 원칙

- `main` 및 Claude 자동 개발 큐는 **독립 Stockbook 제품 개발선**이다.
- `agent/desktop-integration`은 **데스크톱 에이전트 통합 실험/개발선**이다.
- Agent 쪽 요구 때문에 Stockbook 원본 구조를 직접 바꾸지 않는다.
- 공통화 가치가 있는 변경은 원본에 별도 이슈 또는 PR 코멘트로 남긴다.
- 원본의 새 기능이 Agent 쪽에 필요하면 main의 변경을 선택적으로 동기화한다.
- Agent 전용 요소(캐릭터 UI, Agent Tool Layer, 데스크톱 IPC)는 원본 제품에 자동 역병합하지 않는다.

## 1차 재사용 대상

1. 관심종목 조회 및 선택
2. 계좌/보유종목 열람
3. 평가금액·평가손익·수익률 계산
4. 전종목 목록 및 검색
5. 선택 종목 상세 데이터

## 목표 구조

```text
Stockbook Core
  ├─ Watchlist
  ├─ Accounts / Holdings
  ├─ P&L Calculation
  ├─ Stock Master / Search
  └─ Quote / Detail
          │
          ▼
Agent Tool Adapter
          │
          ▼
Desktop Agent UI
```

## 원본으로 피드백해야 하는 변경

다음에 해당하면 `mj94920/stockbook` 원본 이슈 또는 관련 PR에 기록한다.

- 계산식/수익률 산식 오류 또는 개선
- 관심종목·계좌·보유 데이터 구조 변경 필요
- 전종목 검색/조회 API 구조 개선
- 공통 함수로 추출하면 Stockbook 본체에도 이득이 있는 경우
- Agent 작업 중 발견한 Stockbook 버그

반대로 다음은 Agent 작업선에만 둔다.

- 캐릭터 렌더러
- 대화 UI
- Agent intent/tool routing
- 에이전트 전용 미니 패널
- 데스크톱 오버레이/위젯 동작

## Claude 개발선과의 동기화 규칙

- Claude가 진행 중인 PR과 같은 파일을 동시에 수정해야 하면 먼저 해당 PR 상태를 확인한다.
- Agent 작업에서 원본 변경이 필요하다고 판단되면 원본 이슈를 만들거나 관련 이슈/PR에 코멘트를 남긴다.
- 코멘트에는 `Agent integration note` 표기를 사용한다.
- 원본 변경이 완료되면 Agent 브랜치에 main을 다시 동기화하고 중복 구현을 제거한다.

## 현재 주의사항

2026-10-07 현재 원본에서는 PR #42가 UI2 1a (`#36`)를 진행 중이다. Agent 통합 초기 작업에서는 이 PR과 충돌하기 쉬운 도킹 레이아웃/메인 UI 변경을 피하고, 데이터 접근 계층 및 Tool Adapter 설계를 우선한다.

## 2026-10-07 실행 목업

`agent/README.md`에 재사용 함수·실행법·캐릭터 연결·검증 범위를 기록했다. 원본 index/main/preload 및 scripts 수정 없이, 본체를 실행할 때 Agent 어댑터와 미니패널만 추가한다. 사용자가 지정한 I-Character-Project의 실제 DesktopPetAgent와 아린 프레임은 로컬 경로에서 불러오며 공개 Stockbook 저장소에 복사하지 않는다.

본체 npm test, Agent 브라우저 검사(1400×900/1024×768, 다크/라이트), PR #42 HTML 호환 검사와 Electron 실제 IPC 전종목 검색을 통과했다. PR #42의 문맥 패널 계산에서 currentPrice 필드 및 복수 계좌 보유 합산 정합성 문제를 Agent integration note로 전달했다. 실계좌 인증/KIS 동기화, LLM 자유 대화 및 독립 캐릭터 창 패키징은 미검증/후속 범위다.
