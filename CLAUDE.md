# StockBook — 프로젝트 메모

> 현재 버전: **v2.0** | Git: `https://github.com/mj94920/stockbook.git`
> GitHub Pages: `https://mj94920.github.io/stockbook/`

---

## 앱 구조

- **플랫폼**: Electron EXE (오프라인 독자 실행) + PWA/TWA (Android)
- **언어**: HTML (디자인·레이아웃) + Vanilla JS (로직·API)
- **데이터**: JSON 로컬 저장 (`C:\Users\mj949\AppData\Roaming\StockBook\stockbook-data.json`)
- **빌드**: `npm run build` → `C:\Temp\StockBookBuild\` → ZIP
- **모바일**: GitHub Pages push만으로 자동 반영 (APK 재빌드 불필요)

### 빌드 주의사항
- HTML은 ASAR 패키징 → 소스만 고치면 안 됨, 반드시 `npm run build` 후 사용자에게 확인 요청할 것
- 소스만 고친 상태면 "브라우저에서 HTML 직접 열어 확인" 또는 "exe 재빌드 후 확인" 명시

---

## 핵심 로직 메모

### 예수금 계산 (`getCashBalance()`)
우선순위 3단계:
1. `state.cashManual` — 잔고탭 "예수금 직접 설정" 최우선
2. `state.totalAsset - 총매입원가` — 총자산 직접입력값 기반
3. `calcExsugeum()` — 입출금 내역 기반 폴백

**원칙**: 예수금 = 총자산 − 총매입원가 (주가 변동과 무관, 매도 시 실현손익 반영)

`renderBalanceSummary()` / `renderBalanceDonut()` / `renderPortfolioBar()` 전부 이 함수를 공유 → 한 곳만 고치면 전체 반영됨

---

## 증권사 API 현황

| 증권사 | 상태 | 비고 |
|--------|------|------|
| 한국투자증권 (KIS) | ✅ API 키 발급 완료 | REST, 국내+미국 분리 |
| 토스증권 | ⏳ 사전 신청 후 발급 대기 | REST+WebSocket, LLM 친화적, 국내+미국 통합 |
| 미래에셋 | ❌ 개인 신청 불가 | 주력 계좌지만 API 연동 불가 |
| 키움 | 스킵 | 가족 계좌, COM방식 Electron 연동 까다로움 |

- 토스 API 문서: `developers.tossinvest.com` (OpenAPI JSON 스펙 공개 → 코드 자동 생성 가능)
- 미래에셋 계좌에 제룡전기·두산에너빌리티·포스코DX 손실 보유 중 → 회복 시 토스증권으로 대체출고 계획
- **시세 조회 현재**: 네이버 금융 BrowserWindow 스크래핑 → KIS REST API로 교체 예정

### API 키 관리 방침
- 각 사용자가 자신의 API 키를 직접 입력 (로그인 팝업 방식)
- Electron `safeStorage`로 로컬 암호화 저장, 외부 서버 전송 없음
- 설정 팝업에서 증권사별 키 입력·저장·삭제

---

## 로드맵

### 단기 (진행 중)
- [ ] **Setup.exe (NSIS) 전환** — 독자적 오프라인 설치 프로그램
  - `package.json` win target: `nsis`, `oneClick: false`, `language: 1042`
  - 설치 경로 선택·바탕화면 바로가기·프로그램 추가/제거 등록
- [ ] **KIS API 시세 조회 연동** — 네이버 BrowserWindow 스크래핑 대체
- [ ] **API 키 입력 팝업** — 증권사별 키 입력 UI (아래 논의 참고)

### 중기
- [ ] 토스 API 키 발급 후 멀티 잔고 통합 (전 증권사 합산 뷰)
- [ ] Vue.js 도입 검토 — 데이터 바인딩 복잡도 증가 시점에

### 언어/아키텍처 방향
- **HTML**: 디자인·레이아웃 전담
- **JavaScript**: API 연동·상태관리·비즈니스 로직
- **Electron main.js**: API 호출 (CORS 우회) → IPC → 렌더러(HTML)로 데이터 전달
- Electron EXE 구조에서만 가능: CORS 제약 없는 API 호출, 로컬 파일 접근, 오프라인 동작

---

## API 키 팝업 구현 논의

### 방식: 최초 실행 시 설정 마법사 + 설정탭 상시 접근

```
앱 첫 실행 (또는 키 미등록 시)
  └── 모달 팝업: "증권사 API 키를 등록해주세요"
        ├── 한국투자증권: APP Key / APP Secret 입력
        └── 토스증권: Client ID / Client Secret 입력 (발급 후)
```

### 저장 방식
```javascript
// main.js (Electron 메인 프로세스)
const { safeStorage } = require('electron')

// 저장: 암호화해서 로컬 파일에 기록
ipcMain.handle('save-api-key', (event, { broker, key, secret }) => {
  const encrypted = safeStorage.encryptString(JSON.stringify({ key, secret }))
  fs.writeFileSync(`${userDataPath}/${broker}-cred.enc`, encrypted)
})

// 불러오기
ipcMain.handle('load-api-key', (event, { broker }) => {
  const buf = fs.readFileSync(`${userDataPath}/${broker}-cred.enc`)
  return JSON.parse(safeStorage.decryptString(buf))
})
```

### 장점
- 외부 서버 불필요, 완전 오프라인
- 키가 평문으로 JSON에 저장되지 않음 (OS 키체인 수준 암호화)
- 여러 사용자가 각자 PC에서 자기 키 사용 가능

### UI 흐름
1. 앱 시작 → main.js에서 `.enc` 파일 존재 확인
2. 없으면 → 렌더러에 `show-api-setup` IPC 발송 → 설정 모달 자동 오픈
3. 있으면 → 복호화 후 메모리에 로드, 모달 없이 바로 시작
4. 설정탭에서 언제든 키 변경·삭제 가능

---

## 버전 히스토리 요약

| 버전 | 주요 내용 |
|------|---------|
| v1.2.x | Yahoo Finance/네이버 시세 조회, 월복리 시뮬레이터, 거래기록 자동화 |
| v1.3.x | 다크/라이트 테마, 잔고탭 도넛차트, 예수금 계산식 수정, 티커 자동완성 |
| v1.4.0 | Electron IPC 시세 조회, 기업 분석 드로어 |
| v1.4.1 | 모바일 인트로, 뉴스탭 정리 |
| v1.4.2 | 탭버그·주소창·버튼겹침 수정, 예수금 역산 |
| v1.4.3 | 탭버그 완전 수정 (switchSubTab early return 제거) |
| v1.4.4 | 기업 분석 드로어, 예수금↔총자산 연동 버그 수정, 세로모드 종목명 겹침 수정, 저장소 이름 변경(stockbook--→stockbook) |
| v2.0 | NSIS 설치 마법사, KIS API 키 팝업 (safeStorage 암호화), KIS REST API 시세 조회 연동 |
