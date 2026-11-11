# 계좌 · 장부 계약 초안 (Contract 입력 문서)

- 상태: **초안. Contract Gate 이전의 선행 설계.**
  - `shared/docs/DATA_CONTRACT.md` 는 Contract 단계에서 만든다(`AGENTS.md`, `CLAUDE.md` §8). 그 전까지 이 문서가 계좌·장부 부분의 입력이다.
  - **[확정]** 표시는 미팅룸 승인(2026-10-11, `docs/ACCOUNT-LEDGER-DESIGN.md` §9)을 그대로 옮긴 것이다.
  - **[제안]** 은 Claude 제안이다. Contract 에서 승인되기 전에는 구현 기준이 아니다.
  - **[결정 필요]** 는 §10 의 D-번호로 모았다.
- 대상 이슈: #64 계좌 장부, #65 Broker Account Adapter, #63 결함 fix(참고)
- 근거 코드: `main` @ e055842 — `index.html` `getCashBalance()` · `calcExsugeum()` · `syncKisBalance()` · 빠른 주문, `main.js` `fetch-kis-balance`
- 구현 금지: 이 문서는 코드·DB 마이그레이션·`shared/` 를 만들지 않는다.

---

## 1. 식별자와 공통 타입

| 이름 | 정의 | 상태 |
|---|---|---|
| `accountId` | 계좌의 불변 opaque ID. 레거시 `accounts[].id` 를 그대로 보존한다(#29 §3-4 D2) | [확정] |
| `assetId` | 종목의 불변 opaque ID (#47). 계좌 계약은 #47 이후 `assetId` 로만 종목을 가리킨다 | [확정] |
| `ledgerMode` | `'broker'` \| `'local'`. 증권사 이름이 아니라 **계좌 속성**이다 | [확정] |
| `currency` | ISO 4217 3자리 대문자 (`KRW`, `USD` …) | [제안] 형식 / [확정] 다른 통화 합산 금지 |
| `Money` | `{ amount: number, currency: string }` | [제안] |
| 시각 (`asOf`, `at`) | ISO 8601 문자열, 시간대 포함 (예: `2026-10-12T15:30:00+09:00`) | [결정 필요] D-L4 |
| 날짜 (`tradeDate`, `settleDate`) | `YYYY-MM-DD`. 기준은 시장 현지 날짜 | [제안] |

### 1-1. Money 규칙 [제안]
1. 금액은 **항상 통화와 함께** 다닌다. 통화가 없는 금액은 계약 위반이다.
2. 서로 다른 통화의 `Money` 를 더하는 함수는 존재하지 않는다. 합산 함수는 통화가 다르면 예외를 던진다.
3. 정밀도와 반올림은 D-L1 에서 정한다. 그 전까지 구현은 **저장값을 바꾸지 않고**, 표시할 때만 반올림한다.

---

## 2. 계좌 (Account)

```
Account {
  accountId:   string            // 불변
  ledgerMode:  'broker' | 'local'
  broker:      string | null     // 'kis' | 'toss' | 'ls' | 'kiwoom' | 'mirae' | … (표시·어댑터 선택용)
  currency:    string            // 계좌 기준 통화. 이관 기본값 'KRW'
  nickname:    string
  number:      string | null     // 표시용. 비밀값 아님(마스킹은 UI)
  isActive:    boolean
}
```

| 규칙 | 상태 |
|---|---|
| `ledgerMode` 는 계좌마다 하나다. 한 계좌 안에서 값마다 원본이 달라지지 않는다 | [확정] |
| 이관 매핑: `broker === 'kis' && isManual === false` → `broker`, 나머지 → `local` | [확정] |
| `local` → `broker` 전환(나중에 API 를 연결하는 경우)의 장부 처리 | [결정 필요] D-L6 |
| 한 계좌에 통화가 둘 이상인 경우(해외 주식 계좌의 KRW + USD 예수금) | [결정 필요] D-L2 |

---

## 3. 거래 (Execution) — 정산 필드

```
Execution {
  executionId:      string        // 불변 레코드 id (#29 §3-4)
  accountId:        string
  assetId:          string | null // #47 미연결 기록은 null
  side:             'buy' | 'sell'
  tradeDate:        'YYYY-MM-DD'
  qty:              number
  price:            Money         // 체결 단가
  grossAmount:      Money         // 체결금액 = price × qty
  fee:              Money | null  // 매매 수수료
  tax:              Money | null  // 매도 거래세 등
  settlementAmount: Money         // 예수금에 실제 반영되는 금액 (부호 포함)
  settleDate:       'YYYY-MM-DD' | null
  amountSource:     'broker' | 'user' | 'estimated' | 'legacy'
  origin:           'broker_import' | 'local_entry'
  tradeType:        'cash' | 'credit' | …   // 신용은 범위 밖(보존·표시만)
}
```

### 3-1. 부호와 계산 규칙 [제안]
| 항목 | 매수 | 매도 |
|---|---|---|
| `grossAmount` | 양수 | 양수 |
| `fee`, `tax` | 0 이상 (null = 모름) | 0 이상 |
| `settlementAmount` | `−(gross + fee + tax)` | `+(gross − fee − tax)` |

- `fee` 나 `tax` 가 null 이면 정산 계산에서 0 으로 다루고, `amountSource` 로 출처를 남긴다.
- **`settlementAmount` 는 저장값이다.**
  - 읽을 때 다시 계산하지 않는다.
  - 요율이 바뀌어도 과거 거래는 다시 계산하지 않는다. [확정 원칙]
- 국내 주식 `settleDate` 기본은 거래일 + 2영업일이다. 휴장일 처리는 D-L5 에서 정한다.

### 3-2. `amountSource` 전이 [제안]

```
legacy ──▶ user
estimated ──▶ user ──▶ broker
                 └──────▶ broker
broker (종착: 이후 덮어쓰지 않음)
```

- `broker` 값은 로컬 입력으로 덮어쓰지 않는다.
- `user` 값은 증권사 확정값이 들어오면 `broker` 로 바뀐다. 이때 차이를 기록한다.

### 3-3. 레거시 매핑 (#64 이관) [확정]
| 레거시 | 새 필드 |
|---|---|
| `total ?? totalAmt` | `grossAmount` |
| 없음 | `fee = null`, `tax = null` |
| 위에서 계산 | `settlementAmount = ±grossAmount`, `amountSource = 'legacy'` |
| `type` | `side` |
| `date` | `tradeDate` |
| `name` / `ticker` | 유지. 종목 연결은 #47 의 `assetId` |

---

## 4. 장부 이벤트 (local 계좌의 원본)

| 이벤트 | 필드 | 예수금 영향 | 보유 영향 | 상태 |
|---|---|---|---|---|
| `opening_cash` | `accountId, at, amount: Money, reason` | `+amount` | — | [확정] 종류 / [제안] 필드 |
| `opening_position` | `accountId, at, assetId, qty, avgPrice: Money, reason` | — | 수량·평단 설정 | [확정] 종류 / [제안] 필드 |
| `cashflow` | `accountId \| null, at, kind: 'deposit'\|'withdraw', amount: Money, memo` | 입금 `+`, 출금 `−` | — | [확정] (`accountId: null` = 미귀속) |
| `adjustment` | `accountId, at, target: 'cash'\|'position', assetId?, actual, computed, delta, reason` | `+delta` (cash) | 수량·평단 보정 (position) | [확정] 종류 / [제안] 필드 |
| `execution` | §3 | `+settlementAmount` | 매수 · 매도 반영 | [확정] |

- **보정은 덮어쓰기가 아니라 이벤트다.** 사용자가 실제값을 입력하면 `delta = actual − computed` 를 기록한다.
- **미귀속 입출금(`accountId: null`)은 어느 계좌 계산에도 들어가지 않는다.** 화면은 미귀속 합계를 따로 알린다. [확정 원칙]

---

## 5. 예수금 · 보유 결과 모델

```
CashView {
  accountId:   string
  currency:    string
  amount:      number | null   // null = 표시할 값 없음 (미동기화)
  settled:     number | null   // D+2 정산 예수금 (broker, 제공 시)
  pending:     number | null   // 결제 예정분 (제공 시) — 정의는 D-L3
  basis:       'broker_snapshot' | 'local_ledger'
  status:      'ok' | 'stale' | 'sync_failed' | 'never_synced' | 'local'
  asOf:        string | null   // broker: 스냅샷 시각, local: 마지막 이벤트 시각
  lastError:   string | null   // sync_failed 일 때
}

Holding {
  accountId, assetId | null, name, ticker,
  qty: number,
  avgPrice: Money,
  basis: 'broker_snapshot' | 'local_ledger',
  asOf: string | null,
  status: 'held' | 'closed'    // closed = 보유 종료 (일지 연결 보존용, #65)
}
```

- 평가금액, 손익, 총자산은 이 모델에 **없다.** 표시 단계에서 `Holding` 과 Quote(#48) 로 계산하는 파생값이다. [확정 원칙]
- 기본 표시 예수금은 `amount` (당일 예수금)이다. `settled` 는 보조 표시에만 쓴다. [확정]
- `stale` 판정 기준(스냅샷 경과 시간)은 D-L7 에서 정한다.

---

## 6. 조회 함수 계약 (#64 구현 대상)

모든 함수는 **부수효과가 없다**(저장·네트워크 없음). broker 계좌의 값은 마지막으로 저장된 스냅샷만 읽는다. 동기화는 #65 어댑터가 따로 한다.

### 6-1. `getCash(accountId) → CashView`
| 모드 | 계산 |
|---|---|
| `local` | `Σopening_cash + Σdeposit − Σwithdraw + ΣsettlementAmount + Σadjustment(cash)`. 결과 `status: 'local'`, `basis: 'local_ledger'`. **어느 거래의 `settlementAmount` 를 포함하는지(반영 시점)는 §12-1 · D-L9 에서 정한다** |
| `broker` | 마지막 **성공** 스냅샷의 값. 결과 `basis: 'broker_snapshot'` |

broker 의 `status`:
- `ok`: 정상
- `stale`: D-L7 기준을 넘김
- `sync_failed`: 마지막 시도가 실패했지만 이전 성공값이 있음. 값과 `asOf` 는 그 이전 성공값을 쓴다.
- `never_synced`: 성공한 적이 한 번도 없음. `amount: null`.

불변조건:
- **broker 의 `amount` 는 어떤 경우에도 로컬 계산값이 아니다.**
- `never_synced` 는 0 이 아니라 null 이다.
- 없는 `accountId` 는 예외를 던진다. 0 을 돌려주지 않는다.

### 6-2. `getHoldings(accountId) → Holding[]`
- `local`: `opening_position` + 체결 + `adjustment(position)` 으로 수량·평단을 계산한다.
  - 평단 방식은 기존 앱과 같은 **이동평균**으로 한다.
  - 매도는 평단을 바꾸지 않는다. [제안 — 현재 코드와 동일]
- `broker`: 마지막 성공 스냅샷의 보유 목록이다.
- 수량 0 인 항목은 기본적으로 제외한다. 다만 일지가 연결된 `closed` 항목은 옵션(`includeClosed`)으로 조회할 수 있다.

### 6-3. `getExecutions(accountId, { from?, to? }) → Execution[]`
- `local`: 로컬 장부의 체결이다.
- `broker`: 증권사에서 가져온 체결(`origin: 'broker_import'`)이다.
  - 동기화로 짝지어지기 전의 로컬 예정 거래(`origin: 'local_entry'`)는 `pending: true` 표시로 함께 돌려준다.
  - 예정 거래는 broker 의 예수금·보유 숫자에 영향을 주지 않는다. [확정]
- 정렬: `tradeDate` 오름차순, 같은 날은 입력 순서(`seq`).

### 6-4. `getCashByCurrency(accountIds?) → { [currency]: { amount, accounts: CashView[], incomplete: boolean } }`
- 같은 통화끼리만 더한다.
- `amount: null` 인 계좌(미동기화)는 합계에서 빼고 `incomplete: true` 로 표시한다.
  - 0 으로 더하지 않는다. 화면은 "일부 계좌 미동기화"를 알린다.
- `accountIds` 를 생략하면 활성 계좌 전체가 대상이다.
- **통화 간 환산 합계는 제공하지 않는다.** [확정]

---

## 7. Broker Account Adapter 계약 (#65 대상)

### 7-1. 인터페이스 [제안]

```
BrokerAccountAdapter {
  id: string                         // 'kis' 등
  capabilities: Capabilities
  listAccounts(): Promise<RemoteAccount[]>
  fetchSnapshot(accountRef): Promise<SnapshotResult>      // cash + holdings, 같은 시각 기준
  fetchExecutions(accountRef, { from, to }): Promise<ExecutionsResult>
}

Capabilities {
  holdings: boolean        // 보유 조회
  cash: boolean            // 당일 예수금
  settledCash: boolean     // D+2 정산 예수금
  executions: boolean      // 체결 조회
  executionFees: boolean   // 체결별 수수료·세금 제공
  cashflows: boolean       // 입출금 내역
  currencies: string[]     // 지원 통화
  // 아래는 이 계층 밖이며 항상 false
  realtimeQuote: false     // QuoteProvider(#48) 로 분리 등록
  orders: false            // 주문은 범위 밖
}

SnapshotResult =
  { ok: true, complete: boolean, asOf, cash: {amount, settled?, currency}[], holdings: RemoteHolding[] }
| { ok: false, error: { code, message, retryable } }
```

### 7-2. 규칙
1. **UI 와 장부는 증권사 이름이 아니라 `capabilities` 로 분기한다.**
2. 시세는 이 어댑터에 넣지 않는다.
   - KIS 처럼 둘 다 제공해도 `QuoteProvider` 에 **따로 등록**한다. [확정]
   - 그래서 `realtimeQuote`, `orders` 는 이 계층에서 항상 false 다.
3. **`complete: true` 일 때만 유령 보유를 정리한다.**
   - 페이지가 남았거나, 부분 실패했거나, 시간이 초과된 경우는 `complete: false` 다.
   - 이때는 보유를 지우지 않고 갱신만 한다. (§9 E-11 참고)
4. 실패(`ok: false`)는 스냅샷을 바꾸지 않는다. 마지막 성공값을 유지하고 `CashView.status` 만 `sync_failed` 로 바꾼다.
5. 어댑터 결과는 정규화된 값만 돌려준다.
   - 증권사 원본 응답은 저장하지 않는다. 디버그 로그는 예외다.
   - 계좌번호·토큰은 로그에 남기지 않는다.
6. 인증·토큰·호출 한도는 `main.js` 에서 처리한다. 렌더러는 IPC 로 정규화 결과만 받는다(`CLAUDE.md` §1-5).
7. 증권사가 주는 숫자 정밀도를 보존한다.
   - 예: KIS `pchs_avg_pric` 는 소수다.
   - 현재 코드는 `Math.round` 로 평단을 정수로 만든다(§9 E-12). 반올림은 표시 단계에서만 한다.

### 7-3. KIS 매핑 후보 (구현 시 실응답으로 검증) [제안]
| 계약 필드 | KIS 후보 | 비고 |
|---|---|---|
| 당일 예수금 `cash.amount` | `inquire-balance` `output2.dnca_tot_amt` | 현재 사용 중 |
| D+2 `cash.settled` | `output2.prvs_rcdl_excc_amt` | 미사용. 의미 검증 필요 |
| 보유 | `output1[]`: `pdno`, `hldg_qty`, `pchs_avg_pric` | `prpr`(현재가)는 시세라 계약에서 제외 → Quote |
| 페이지 연속 | 응답 헤더 `tr_cont` + `ctx_area_fk100/nk100` | **현재 미처리** (E-11) |
| 체결 | 일별주문체결조회 (`inquire-daily-ccld`) | 조회 기간 제한·수수료 제공 여부 확인 |
| 수수료·세금 | 기간별매매손익 계열 조회 | 제공하지 않으면 `executionFees: false` |

---

## 8. 불변조건 모음 (테스트로 고정)

1. 한 계좌의 한 값에는 원본이 하나다. broker 계좌의 예수금·보유는 로컬 계산으로 만들어지지 않는다.
2. 미동기화 broker 계좌의 예수금은 null 이다. 0 이 아니다.
3. 통화가 다른 금액은 합산되지 않는다. 시도하면 예외가 난다.
4. `settlementAmount` 는 저장값이다. 다시 계산하지 않는다.
5. 미귀속 입출금은 어느 계좌 예수금에도 들어가지 않는다.
6. 보정은 이벤트로만 일어난다. 계산값을 직접 덮어쓰지 않는다.
7. 불완전한 스냅샷(`complete: false`)으로는 보유를 삭제하지 않는다.
8. **이관 직후 계좌별·통화별 예수금과 보유(수량·평단)는 이관 전과 같다.** [확정]

---

## 9. 결함 추적 (E)

| # | 결함 | 위치 | 담당 | 상태 |
|---|---|---|---|---|
| E-1 | 0원·마이너스 예수금 계좌가 합산에서 빠짐 (`cash > 0`) | `getCashBalance()` 외 | **#63** | 대기 |
| E-2 | `total` / `totalAmt` 가 섞여 빠른 주문 거래가 계산에서 누락됨 | `calcExsugeum()` | **#63** | 대기 |
| E-3 | 예수금 4단 폴백(cash → cashManual → totalAsset → 입출금) | `getCashBalance()` | #64 | 대기 |
| E-4 | 전역 `cashManual` | state | #64 | 대기 |
| E-5 | 전역 `totalAsset` 역산 | state | #64 | 대기 |
| E-6 | 입출금에 `accountId` 없음 | `cashflows[]` | #64 | 대기 |
| E-7 | 수수료·세금 미반영 | trades 전체 | #64(필드), #65(broker 값) | 대기 |
| E-8 | 계좌에 통화 필드 없음 | `accounts[]` | #64 | 대기 |
| E-9 | KIS 유령 보유(증권사에서 사라진 종목 유지) | `syncKisBalance()` | #65 | 대기 |
| E-10 | KIS 체결 미수집 | `syncKisBalance()` | #65 | 대기 |
| **E-11** | **KIS 잔고 조회가 연속 페이지(`tr_cont`, `CTX_AREA_*`)를 따라가지 않음.** 보유가 한 페이지를 넘으면 나머지가 빠짐. E-9 정리와 겹치면 **실제 보유를 지울 위험** | `main.js` `fetch-kis-balance` | **#65 (신규 · 선행 조건)** | 신규 발견 |
| E-12 | KIS 평균단가 `Math.round` 로 소수 손실 | `main.js` `fetch-kis-balance` | #65 | 신규 발견 |
| E-13 | 빠른 주문이 broker 계좌 `acct.cash` 를 직접 가감 | 빠른 주문 | #65 | 대기 |
| E-14 | 계좌 이체가 broker 계좌 cash 도 로컬에서 가감 | 계좌 이체 | #64(local 만 허용) / #65 | 신규 기록 |
| E-15 | 문맥 패널 현재가 기준·복수 계좌 미합산 | `dockCtxRender()` | #42 (수정 푸시, CI 라벨 대기) | 수정됨·미병합 |

- 이미 할당된 결함은 이 문서에서 구현하지 않는다.
- E-11, E-12, E-14 는 #65·#64 이슈 본문에 추가한다.

---

## 10. 결정 필요 항목

| ID | 질문 | Claude 권장안 | 영향 |
|---|---|---|---|
| D-L1 | 통화별 최소단위·반올림 (KRW 정수원? 절사·반올림?) | KRW 는 **저장 시 원 단위 정수, 반올림 없이 증권사 값 그대로**. 추정 수수료는 원 미만 **절사**. USD 는 소수 2자리 | 정산 계산·테스트 정답 |
| D-L2 | 한 계좌의 다통화 예수금(해외 계좌) | Account 는 기준 통화 하나, `CashView` 는 **통화별로 여러 개** 허용 | 모델 구조 |
| D-L3 | `pending` 의 정의 (D+1·D+2 미결제분) | KIS 가 주는 값만 쓴다. 계산하지 않는다. 없으면 null | #65 범위 |
| D-L4 | 시각 형식·시간대 | ISO 8601 + 오프셋, 저장은 UTC, 표시는 KST | 전 계약 공통 |
| D-L5 | 결제일 계산의 휴장일 처리 | 증권사 제공 `settleDate` 우선. 로컬 입력은 단순 +2 영업일(주말만 제외), 휴장일 보정 없음을 명시 | local 예수금 정산 시점 |
| D-L6 | local → broker 전환 시 기존 로컬 장부 | 장부를 **보관(읽기 전용)** 하고, 이후 원본은 증권사로 한다. 차이는 전환 시점 보고서로만 남긴다 | 사용자 이력 보존 |
| D-L7 | `stale` 판정 기준 | 장중 30분, 장외는 직전 영업일 종가 이후 성공 여부 | 표시 상태 |
| D-L8 | 수수료 추정 요율 프로필의 위치 | 계좌별 설정. 기본값 없음(추정 끔) | 추정값 노출 여부 |
| **D-L9** | **local 예수금의 거래 반영 시점과 과거 시점 계산 (#68 검토에서 발견)** | §12-1 안: 당일 예수금 = 결제일 ≤ 기준일, D+2 = 체결일 ≤ 기준일. `getCash(accountId, { asOf, basis })` 로 과거 시점 지원 | local 예수금 값 · 잔고 CSV 비교 · #64 이관 |
| D-L10 | 증권사 문서(CSV 등)에서 온 확정 금액의 출처 표현 | §12-2 안: `amountSource` 는 4종 유지(`broker` = 증권사 확정값), 입력 경로는 `origin: 'csv_import'` 로 분리 | 출처 enum · 정정 규칙 |
| D-L11 | 성공한 입력의 취소·정정 이벤트 | §12-3 안: `void` 이벤트(원 이벤트 id 참조)로 상쇄. 삭제·재작성 금지 | #64 이벤트 종류 |

---

## 11. 테스트 조건 (#64 · #65 완료 기준의 입력)

### 11-1. `getCash` 픽스처
| 대상 | 기대 |
|---|---|
| local: opening 1,000,000 + 입금 500,000 − 출금 200,000 + 매수 −(1,000,000+150) + 매도 +(600,000−90−1,380) + 보정 −10 | 계산 결과와 정확히 일치 |
| local: 미귀속 입출금 | 어느 계좌에도 들어가지 않음 |
| broker: 성공 스냅샷 → 실패 | 값·`asOf` 유지, `status: 'sync_failed'` |
| broker: 성공 이력 없음 | `amount: null`, `status: 'never_synced'` |
| broker: 로컬 예정 거래 존재 | `amount` 는 스냅샷 그대로 |
| 0원·음수 계좌 | 값 그대로 포함 (E-1 회귀) |

### 11-2. `getCashByCurrency`
| 대상 | 기대 |
|---|---|
| KRW 2계좌 + USD 1계좌 | 두 개의 합계로 나옴, 환산 없음 |
| 미동기화 계좌 포함 | `incomplete: true`, 합계에서 제외 |

### 11-3. 이관 (#64)
- 단일 local 계좌
- 복수 local 계좌 + 미귀속 입출금
- broker + local 혼합
- `cashManual` 만 있는 경우
- `totalAmt` 거래
- 거래 없이 추가한 보유

각 경우 **이관 전후의 화면값(계좌별 예수금, 보유 수량·평단)이 완전히 같아야** 한다. 롤백 시험도 포함한다.

### 11-4. 어댑터 (#65, 모의 응답)
| 대상 | 기대 |
|---|---|
| 정상 1페이지 | 정상 반영 |
| **2페이지 이상** | 전 페이지 합본 (E-11) |
| 페이지 도중 실패 | `complete: false`, 보유 삭제 없음 |
| 종목 사라짐 + `complete: true` | 해당 보유 `closed`, 일지 보존 |
| 빈 응답 | `ok: false` 또는 `complete: false`. **전량 삭제 금지** |
| 평단 소수 | 소수 보존 (E-12) |

---

## 12. CSV Import(#68) 검토에서 드러난 계약 보완 [제안]

#68 의 Codex 설계 검토(2026-10-13)를 시스템 관점에서 확인한 결과다. 계약에 빈 곳 세 가지와 필요한 메타 정보 하나가 확인됐다.

### 12-1. local 예수금의 반영 시점 (D-L9) — 잔고 비교의 선행 조건

**문제**: §6-1 은 `settlementAmount` 를 "모두" 더한다. 그런데 기본 표시는 **당일 예수금**이다.
- 국내 증권사의 당일 예수금은 결제(D+2)가 끝나지 않은 매수·매도를 아직 반영하지 않은 값이다.
- 지금 식으로 계산하면 당일 예수금이 아니라 **D+2 예수금**에 가까운 값이 나온다.
- 그러면 CSV 나 증권사 화면과 같은 기준으로 비교할 수 없다.

**제안**

```
getCash(accountId, { asOf = 오늘, basis = 'd0' | 'd2' })

local:
  d0 (당일 예수금) = Σopening_cash + Σcashflow(at ≤ asOf) + Σadjustment(cash, at ≤ asOf)
                   + Σ settlementAmount  [settleDate ≤ asOf 인 거래]
  d2 (D+2 예수금)  = 위 식에서 마지막 항만
                   + Σ settlementAmount  [tradeDate ≤ asOf 인 거래]
```

- 기본 표시는 `d0` 이다([확정] 당일 예수금 기본). `d2` 는 보조 표시다.
- **`settleDate` 가 없는 레거시 거래**
  - 체결일에 결제된 것으로 본다. 그러면 `d0` 와 `d2` 에 같은 값이 들어간다.
  - #64 이관 시점의 차이는 opening 이 흡수하므로 화면 숫자는 바뀌지 않는다.
- broker 계좌의 `asOf` 는 과거 시점을 받지 않는다. 마지막 스냅샷만 있기 때문이다.
- 잔고 CSV 와 비교할 때는 CSV 가 가리키는 기준(당일 / D+2)과 같은 `basis` 로 계산한다.
- `출금가능금액` 은 위 둘과 의미가 다르다. 비교하거나 보정하는 대상이 아니라 참고로만 표시한다.

### 12-2. 증권사 문서에서 온 확정 금액의 출처 (D-L10)

#68 은 새 값 `amountSource: csv_confirmed` 를 제안했다. 시스템 검토 의견은 이렇다.

- **`amountSource` 와 입력 경로를 분리하자는 방향에는 동의한다.**
- **새 enum 대신 기존 값을 쓰는 안을 권장한다.**
  - 증권사 거래내역 CSV 의 체결금액·수수료·세금은 증권사가 확정한 값이다. 그래서 `amountSource: 'broker'` 다.
  - 입력 경로는 §3 의 `origin` 에 `'csv_import'` 를 추가해 구분한다. 기존 값은 `broker_import` · `local_entry` 다.
- **#68 이 우려한 정정 충돌의 해소**
  - §3-2 의 "`broker` 값은 로컬 입력으로 덮어쓰지 않는다"는 사용자가 손으로 입력한 값을 막는 규칙이다.
  - 같은 강한 키(체결번호)로 들어온 **증권사 문서의 정정**은 `broker → broker` 갱신으로 허용한다. 이때 이전 값과 근거를 감사 기록에 남긴다.
- **`ledgerMode` 는 바뀌지 않는다.** CSV 로 입력해도 local 계좌는 그대로 local 이다. [확정 원칙과 일치]

### 12-3. 성공한 입력의 취소·정정 (D-L11)

- §4 의 이벤트에는 상쇄 수단이 없다.
- CSV 배치 취소, 잘못 넣은 수동 거래 정정에 모두 필요하다. 그래서 #64 범위에 넣는 것을 권장한다.

```
void { eventId(신규), targetEventId, at, reason, batchId? }
```

- 대상 이벤트는 지우지 않는다. 계산할 때 `void` 된 이벤트를 제외한다.
- 감사 기록과 일지 연결은 보존한다.
- 후속 이벤트(이후 거래나 보정)가 있으면 `void` 후 재계산 결과를 미리보기로 보여주고 사용자가 확인한다.
- DB 백업 복원으로 되돌리지 않는다. 이후의 다른 변경까지 지워지기 때문이다. [#68 과 일치]

### 12-4. 장부 리비전 (#68 의 preview 재검증용)

- #68 은 미리보기를 만든 시점과 반영 시점 사이에 장부가 바뀌었는지 확인하는 `ledgerRevision` 을 요구한다.
- #29 v1 에는 계좌 단위로 단조 증가하는 리비전이 없다. `updated_at` 은 행 단위다.
- **제안**: #64(v3) 에서 계좌별 `ledger_revision` 정수를 둔다. 장부 이벤트를 쓰는 트랜잭션마다 1 증가시킨다.
- Import 반영 트랜잭션 안에서 미리보기 시점의 리비전과 비교한다. 다르면 중단한다.

### 12-5. #68 권장안에 대한 시스템 판정 요약

| #68 항목 | 판정 | 비고 |
|---|---|---|
| D-C1 #64 이후 별도 이슈, 국내 현금 서식 1종 MVP | **동의** | #65 는 필수 선행이 아니라는 근거도 타당하다. local 입력이고 broker 원본과 섞지 않는다 |
| 데이터 모델 분리 (Batch / Row / Evidence / Plan / Audit) | **동의** | 장부 이벤트와 증거를 섞지 않는다 |
| 3단계 중복 판정 (파일 → 체결번호 → fingerprint 후보) | **동의** | 행 번호는 키가 아니다. 주문번호만으로는 강한 키가 아니다 |
| 같은 기준시점, 거래 먼저 → 차이만 opening·adjustment | **동의 + 보완** | 반영 시점 규칙이 없으면 성립하지 않는다 → **D-L9 (§12-1) 를 먼저 정해야 한다** |
| D-C2 `csv_confirmed` | **수정 권장** | §12-2: `amountSource: broker` + `origin: csv_import` |
| D-C4 미확인 행은 staging 에 보류 | **동의** | 장부에 null 종목을 넣는 것은 #47 규칙이 정해진 뒤 별도 승인 |
| D-C8 원자적 반영, 성공 후 정정은 별도 | **동의 + 보완** | `void` 이벤트(§12-3)와 `ledger_revision`(§12-4)이 #64 에 있어야 한다 |
| #29 v1 확장하지 않음 | **동의** | C-1 재검증과 같은 결론이다. 필요한 메타는 이후 버전에서 `ALTER ADD COLUMN` 또는 새 테이블로 추가한다 |

