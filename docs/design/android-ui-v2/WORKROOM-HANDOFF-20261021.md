# StockBook 모바일 작업실 이관 인계서

작성: 2026-10-21 KST. 목적은 프록시 오류가 반복되는 작업실에서 다른 작업실로 이동할 때 승인 근거·원본·코드·검증 상태를 잃지 않는 것이다. 새 화면/카드/계약을 승인하거나 구현을 확대하는 문서가 아니다.

## 다음 작업실에서 먼저 열 곳

| 구분 | 저장소 위치 | 확인한 상태 |
|---|---|---|
| 승인 디자인 원본·미리보기 | [PR #76](https://github.com/mj94920/stockbook/pull/76) · [고정 원본 폴더](https://github.com/mj94920/stockbook/tree/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved) | open, 미병합. 홈·시장 뉴스공시 시각 승인 발췌본 9개 |
| 후속 독립 코드 | [PR #77](https://github.com/mj94920/stockbook/pull/77) · [고정 코드 폴더](https://github.com/mj94920/stockbook/tree/5a5ec3ec3a22778bacf20830fe27f05e2b361521/docs/design/android-ui-v2/prototypes/home-news) | open, 미병합. 최신 내부 리딩 포함, 코드·문서 12개 |
| 화면 대조표 | [SCREEN-COMPARISON.md](https://github.com/mj94920/stockbook/blob/5a5ec3ec3a22778bacf20830fe27f05e2b361521/docs/design/android-ui-v2/prototypes/home-news/SCREEN-COMPARISON.md) 및 같은 폴더 CSV | 8열·22행. 카드 단위 최종 정규화표가 아님 |
| 작성자 검증 | [VALIDATION.md](https://github.com/mj94920/stockbook/blob/5a5ec3ec3a22778bacf20830fe27f05e2b361521/docs/design/android-ui-v2/prototypes/home-news/VALIDATION.md) | 작성자 실행 결과이며 시스템룸 승인과 구분 |
| 대표본 출처 | 같은 코드 폴더 source-manifest.json, code-manifest.json | 첨부 대표본 SHA-256 및 코드 해시. 계약 식별자가 아님 |

확인 시점 main은 `209b392f9127f45285aa44ba1041bf8ad61a5b17`이다. main이 예전 `77c7497` 그대로라고 가정하지 않는다. 두 자료는 GitHub PR 브랜치에 보관됐지만 **main에 병합된 것으로 취급하지 않는다**. 기존 PR을 수정/재생성/머지하지 않았다. 고정 커밋 링크는 작업실의 /tmp·/workspace 경로에 의존하지 않는다.

## 승인 자료 보존 확인

로컬 첨부 `StockBook-mobile-v03-design-collection-20261020.zip`의 `01-approved/` 9개를 PR #76 변경 파일의 Git blob SHA와 대조했고 **9/9 일치**했다. 승인 발췌본은 이미 GitHub에 누락 없이 보관돼 있어 또 다른 사본을 생성하지 않는다.

| 파일 (v0.3-approved/ 상대경로) | 확인한 Git blob SHA |
|---|---|
| [README.md](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/README.md) | `6fdf64497d1ec85cd45f2feb5253be684e5568aa` |
| [VALIDATION.md](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/VALIDATION.md) | `f7a9be3ef1709e8646be3fcaa9c0de53c9bc011c` |
| [home.html](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/home.html) | `ca742651c27c4da6b15d390126288ded40e66328` |
| [manifest.json](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/manifest.json) | `98406ab49adf7ebc240e1a00c6d95334312dca95` |
| [news-disclosures.html](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/news-disclosures.html) | `9be7d1880b4857c820381f6c093f4b3bcc64f098` |
| [preview.css](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/preview.css) | `d3bead0990261812e89d25a6124769080d838d6f` |
| [preview.js](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/preview.js) | `d0fd62b37cb100dca9d3a84ca509f923776c29d0` |
| [source/home.html](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/source/home.html) | `279e5e807c8bf502510fa8bf1fcd9d6ea339955b` |
| [source/news-disclosures.html](https://github.com/mj94920/stockbook/blob/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved/source/news-disclosures.html) | `07084f11a093e578152c46ecd771b4467d9a2256` |

홈 승인 근거는 사용자 `통과`, 뉴스공시 시각 승인 근거는 `음 데이터를 어떻게 가져올 건지는 확실치 않아도 일단 합격`이다. 2026-10-20 사용자가 뉴스는 링크 이동이 아니라 프로그램 내 리딩이라고 정정했고, 이 방향으로 수정한다는 제안에 `좋아`라고 승인했다. 이 정정은 PR #77의 최신 코드·테스트·문서에 반영돼 있다. #76의 과거 외부 원문 이동 설명보다 최신 사용자 지시를 우선한다.

## 반영된 코드와 반영되지 않은 부분

- 홈: 총자산(예수금 포함), 보유·관심종목, 시장 지수, 투자 신호, 주요 일정, 작성 중인 일지의 6개 카드.
- 뉴스공시: 기사/공시 분류, 언론사 필터 초안·적용·전체 선택·빈 결과 복구, 발행일 최신순 피드.
- 뉴스 읽기: 기사 선택 → **프로그램 내 리딩** → 목록 복귀. 적용 필터·스크롤·기사 포커스 유지. 브라우저 앞뒤 이동·직접 진입·잘못된 기사 주소 처리.
- 리딩 본문은 **미연결·검토용 예시**. 실제 기사 본문/요약/AI 결과를 수집·생성하지 않는다. 외부 원문은 리딩 화면의 별도 보조 링크다.
- 표시 상태: 예시/미연결/로딩/오류/실제 결과 없음 분리. 자동 외부 요청 없음(CSP connect-src:none), 사진은 원본의 내장 데이터.
- 카드·타이포·탭·피드·필터·하단 도구를 토큰/컴포넌트로 작성. 동일 시안의 수정본을 여러 화면으로 구현하지 않았다.
- 종목/사업/재무/지표/자산/거래/일지/설정/인증은 전체 구현이 아니라 시안·대조표 상태다. 경계 밖 버튼은 안내만 표시한다.
- 실제 Android 프로젝트/APK/Kotlin, Provider·저장·인증·장부·규칙 엔진 연결은 없음. Android Studio 구현을 시작하지 않는다.
- 실제 데이터 검증/시스템룸 검수 완료를 주장하지 않는다.

코드는 PR #77 브랜치 `codex/mobile-v03-home-news-prototype`의 `docs/design/android-ui-v2/prototypes/home-news/index.html`로 연다. 관리형 브라우저가 file URL을 막으면 로컬 정적 서버로 실행한다. PC 루트 `index.html`을 대신 열거나 수정하지 않는다.

## 디자인 구조와 자료 구분

- 하단 도구: 홈 / 시장 / 종목 / 자산관리 / 일지. 홈 상단 발견 유지.
- 세부탭 안의 카드 인 피드, 밝고 둥근 라이트 UI, 짙은 글씨·내용에 맞는 낮은 카드 높이 유지. 다크모드는 별도.
- 설정·인증은 하단 도구 바로 위. 스크롤 고정 정책은 미정.
- 보유·종목 목록에 펼침 기능을 추가하지 않는다. 기업 로고는 공식 심볼 우선이며 임의 글자 로고로 대체하지 않는다.
- 오늘 뜨는 업종·테마는 작은 아이콘/이름/보조정보/수치의 세로 행과 더보기를 가진 **카드 하나**. 큰 타일 그리드·별도 시장 메인으로 확대하지 않는다.
- Industry와 Theme는 별개. 산업은 실제 사업, Theme는 횡단 주제. 70종 아이콘 후보를 확정 taxonomy나 industryKey로 해석하지 않는다. 전용 그림이 없는 Theme는 fallback 지원.
- 02-current는 22개 주요 화면의 전체 통합 검토본, 03-journal-patches는 9개 별도 화면이 아닌 일지 주제·입력·상태 보완, 04-archive는 이전 수정 이력이다.
- 재무·사업·지표·자산·거래 카드 시안은 이미 있다. 새로 설계하지 말고 대표본을 고른다. 일지는 한 종목 투자 과정의 5주제(언제/얼마, 왜, 계좌/수량, 손익, 멘털), 주제별 접기/펴기이며 매수/매도/메모 탭 분리는 하지 않는다.
- 전체 ZIP의 161개 HTML·22화면·50개 배치는 서로 다른 집계다. 카드 배치에는 재사용이 포함된다.

**미승인 자료 보존 경계:** 전체 ZIP과 02-current/03-journal-patches/04-archive를 이번 승인 자료 이관에서 일괄 공개 업로드하지 않는다. 이들은 PR #77의 출처 해시·대조표에 기록돼 있지만 전체 원본 내용이 GitHub에 보관됐다고 주장하지 않는다. 해당 시안 작업을 재개할 때는 사용자가 보유한 원 ZIP을 새 작업실에 첨부하거나 별도 자료 보관 승인을 받아야 한다. 예전 70종 아이콘 ZIP도 수령·최종 승인됐다고 가정하지 않는다.

## 현재 중단점과 다음 작업

사용자가 카드 생성이 꼬였다고 지적했다. **새 카드 생성·추가 화면 구현을 멈춘 상태로 이관**한다. 직전의 카드 단위 기준표·단일 미리보기 정리는 아직 완료하지 않았다. 22행 화면 대조표를 카드 단위 정리가 끝난 결과로 보고하지 않는다.

다음 작업 순서:
1. 현재 AGENTS.md·CLAUDE.md·관련 PR 상태를 다시 읽고 진행 중 PC 작업과 충돌하지 않는지 확인한다.
2. PR #76 디자인 원본과 PR #77 실제 코드를 구분해 연다. 뉴스 읽기는 최신 내부 리딩 수정본을 기준으로 한다.
3. 시스템룸에는 **PR #77 실제 코드**의 읽기 전용 검수를 요청한다. #76 검수로 #77까지 확인했다고 기록하지 않는다.
4. 기존 카드별 대표본 하나와 수정 이력을 연결하고 디자인 승인/코드 반영/데이터 연결/검증을 별도 상태로 기록한다. 자료가 없으면 임의 재제작하지 않는다.
5. 종목→재무 등 후속은 기존 시안의 대표 선정·충돌 기록을 먼저 하고 사용자 승인과 구현 게이트를 확인한다. 통합본과 보완본을 임의 합치지 않는다.

## 시스템·계약 경계

- 기존 Android Gate와 Shared Contract 절차를 유지. Gate 전 android/ 생성 금지. 모바일 디자인을 PC index.html에 적용하지 않는다.
- 금액은 통화별 분리. 해외/USD 기능 추가·이종 통화 합산 금지.
- 예수금 당일/정산 예정, 취소·정정, CSV는 **임시 · 계약 미확정**. 현재 홈뉴스 코드에는 해당 상세/입력 화면이 없다.
- DC-1: `{ settled, amount, pending } + asOf` 조건부 승인, 기존 basis 의미 유지. 결제일 누락을 당일 결제 또는 d0=d2로 간주하지 않는다. 레거시 compatibility는 별도.
- DC-2: 원 이벤트 참조 void, 정정은 void + 신규 이벤트/correctionOf. 연결 일지 자동 삭제 금지. ledger_revision은 #64 v3 범위.
- 비용 미확인을 0원으로 만들거나 비용 차감 전 손익을 순이익으로 표시하지 않는다.
- 상태와 사건 분리, 관찰·메모 금액 입력 없음, 신호의 **규칙 판정 · 투자 권유 아님** 고지 유지.
- 분류 키·기업 연결·뉴스/이미지/본문 제공·수집 정책·AI 결과를 임의 확정하지 않는다.

시스템룸 검수 항목: 임시 표기 경계 / 통화 및 합산 / android·shared 미변경 / PC 미이식 / 자동 외부 호출 없음. 작성자 검증과 시스템룸 검수는 별개이며 이 작업실에는 검수 완료 회신이 없다.

## 검증과 연결 장애 기록

PR #77 코드 고정 커밋 `5a5ec3ec3a22778bacf20830fe27f05e2b361521`의 GitHub CI 정적+스모크 **success**, 자동 머지는 skipped임을 이관 전 재확인했다. 작성자 자체 검증은 홈6/기사5/공시3, 필터·내부 리딩·왕복·스크롤·포커스·주소 처리, 320/360/390px·자체 글자 100/200%, pageerror 0·자동 외부 요청 0. 실기기/Android 시스템 폰트·스크린리더·실데이터·최신 거래상세·일지 입력 보존 검증은 아니다.

셸 연결의 마지막 확인 오류:
```
curl: (7) Failed to connect to proxy port 8080 after 0 ms: Could not connect to server
fatal: unable to access 'https://github.com/mj94920/stockbook.git/': Failed to connect to proxy port 8080 after 0 ms: Could not connect to server
```
2026-10-15 18:37:31 KST 최초 점검, 이후 Git 재시도에서도 같은 오류가 확인됐다. HTTP_PROXY/HTTPS_PROXY와 소문자 변수가 http://proxy:8080, Git 자체 proxy 설정 없음. GitHub 연결 도구는 정상이다. 설정 임의 변경/프록시 우회/비밀값 출력 없이 연결 도구로 자료를 보관했다. 새 작업실에서 읽기 전용으로 재점검하고 동일하면 실행 환경 장애로 지원팀에 전달한다. 사용 가능한 재시작/지원 신고 도구는 없었으며 신고 완료라고 보고하지 않는다.

이관 문서 PR은 main `209b392`의 필요한 파일만 연결 도구로 복원한 격리 스냅샷에서 저장소 기존 npm test(정적 검사+스모크)를 실행해 통과했다. 전체 clone/npm ci 또는 Android 테스트를 했다는 뜻이 아니다. 이 문서는 기존 PR을 병합하거나 앱/계약/워크플로를 변경하지 않는다. 독립 codex 브랜치·PR, 라벨 없음, 사용자 머지 원칙을 유지한다.
