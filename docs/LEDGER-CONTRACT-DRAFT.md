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
| `local` | `Σopening_cash + Σdeposit − Σwithdraw + ΣsettlementAmount + Σadjustment(cash)`. 결과 `status: 'local'`, `basis: 'local_ledger'` |
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

## 13. 후속 검토 — 이관·조회 결정 필요 사항 (#69, 2026-10-14)

이 절은 리뷰에서 발견한 미정 항목을 기록한다. 아래 항목은 신규 승인 정책이 아니며 기존 D-L1~D-L8을 대체하지 않는다. 문서 머지는 구현 승인이 아니다.

| ID | 충돌·미정 범위 | 결정에 필요한 비교 | 구현 보류 범위 |
|---|---|---|---|
| R-L1 | 레거시 broker cash·보유에는 검증된 성공 시각/출처가 없고 로컬 수정도 섞인다. §6의 마지막 성공 스냅샷·never_synced 규칙과 숫자 불변 이관을 동시에 만족하는 경로가 없다 | 레거시 값을 미확인 상태로 보존하는 경로 / 검증 동기화·사용자 확인까지 이관 보류. 숫자 불변 적용 범위 포함 | #64 broker 초기화·#65 전환 접점 |
| R-L2 | 전역 cashManual·totalAsset 역산값에 계좌별 귀속 근거가 없는 복수 local 계좌에서 전후 계좌별 동치성 기준이 없다 | 사용자 귀속 확인 / 미해결 전역 값 보존 및 이관 보류. 임의 기본 계좌 배분 금지 | #64 opening_cash 생성 |
| R-L3 | 거래 계산과 저장 보유의 수량은 같고 평단만 다르면 수량 차이 opening으로 원가를 보존할 수 없다. opening의 과거 거래 포함 범위·적용 순서도 미정 | 원가 보정 이벤트 / 기준시점 opening과 이전 기록 포함 범위. 평균단가 숫자만 덮어쓰지 않음 | #64 opening_position·평단 이관 |
| R-L4 | §7-2의 complete:false 결과 '갱신만 한다'와 §6의 마지막 성공 스냅샷 조회의 관계가 불명확하다 | 부분 결과를 기준 스냅샷과 별도 보관 / 구성요소별 성공·기준시각 계약. 기준값 교체의 원자성 포함 | #65 snapshot 저장·부분 실패 |
| R-L5 | §6-1 settlementAmount 전체 합산과 당일 예수금 표시 사이에 거래일·결제일 반영 기준이 없다 | 당일 현금·정산 예정·출금가능의 의미, 날짜/시각 포함 조건, 과거 asOf, settleDate 누락. D-L5 결제일 계산과 구분 | #64 getCash·후속 CSV 잔고 비교 |

권장안과 승인 결과는 #69에서 추적한다. 결정을 받기 전에는 §3~§7의 위 관련 제안을 임의의 구현 규칙으로 확정하지 않는다.

### 13-1. 추가 fixture 요구

- 복수 local 계좌에서 cashManual만 있는 경우, totalAsset 역산값만 있는 경우, broker/local 혼합
- broker 레거시 값은 있으나 성공 시각/출처가 없는 경우, 첫 검증된 동기화 성공·실패
- 보유 수량 동일·평단 상이, 거래 없이 등록된 보유, 과거 거래 추가, 전량 매도 후 재매수
- 페이지 중간 실패, cash 성공·holdings 실패, 마지막 성공값/asOf 보존, 완전한 빈 잔고와 오류 빈 응답 구분
- 거래일과 결제일 사이의 cash, 휴장일, settleDate 누락, 과거 asOf

테스트 정답은 승인 결과로 정한다. 기존 CI/스모크 통과만으로 위 동치성·원장 의미가 검증됐다고 기록하지 않는다.
