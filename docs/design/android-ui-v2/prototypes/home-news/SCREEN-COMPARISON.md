# 모바일 v0.3 화면·코드 대조표

2026-10-20 · 대표 선정은 구현 승인이나 계약 확정이 아니다. 22행은 전달된 화면 지도를 유지하며, 연결 일지 재사용을 포함한다. HTML 161개를 161개 화면으로 취급하지 않는다.

기준: 첨부 ZIP의 index.html / screen-map.csv / 승인 발췌본 / 현재 통합본 / 일지 9개 보완본. 경로는 ZIP 내부 상대경로이며 전량 저장소 업로드하지 않는다.

| 도구 | 세부 화면 | 포함 카드 | 대표 시안 | 승인 근거 | 기존 코드 | 필요한 변경 | 계약 대기 |
|---|---|---|---|---|---|---|---|
| 홈 | 홈 | 총자산·보유/관심종목·지수·신호·일정·일지 초안 | 01-approved/source/home.html | PR #76 README HOME: 사용자 통과 | index.html + app.js home() / ui.css | 6개 카드 순서·라이트 톤 유지; 데이터 상태 분리·통화 단위 보강 | 총자산·예수금 의미/규칙 엔진/시세·일지 데이터 |
| 홈 | 발견 | 탐색 진입 및 발견 피드 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 홈 / 발견) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 현재 통합본의 승인 범위는 아님; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 시장 | 시장 개요 | 시장 흐름·수급·오늘 뜨는 업종·테마 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 시장 / 시장 개요) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 기존 시험구동 구조 유지, 업종은 목록형 카드; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 시장 | 뉴스 | 일반 기사·공시, 언론사 필터 | 01-approved/source/news-disclosures.html | PR #76 README NEWS: 데이터 방식 미확정 조건의 시각 합격 | app.js newsShell()/newsResults(), news-data.js | 일반/공시·필터 유지·발행일순 유지; 내부 기사 리딩·목록 복귀; 상태 검토 추가 | 기사·사진·본문/원문 정책, 공시 제공원·식별자 |
| 시장 | 일정 | 날짜·기간 선택, 일정 상세 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 시장 / 일정) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 예시 일정·미수신 값을 실데이터로 확정하지 않음; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 종목 | 목록 | 관심·보유·최근, 검색, 관심종목 편집 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 종목 / 목록) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 기업 심볼 일괄 정리는 후속 구현 시; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 종목 | 개요 | 가격·차트·사업 요약·뉴스·보유·일지·일정 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 종목 / 개요) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 요약 카드 중복 생성 중지; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 종목 | 사업 | 사업 구성·분야·관련 기업 연결 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 종목 / 사업) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 예시 사업 비중과 실제 수집 가능 데이터 구분; 이번 구현 보류 | 산업·기업 소속 근거와 비중 |
| 종목 | 재무 | 매출·영업이익·현금흐름, 막대+선, 표 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 종목 / 재무) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 이미 제작됨. 새 재무 카드 세트로 다시 만들지 않음; 이번 구현 보류 | 재무 제공원·보고기간·단위·미수신 처리 |
| 종목 | 지표 | PER·PBR·수익성·안정성·배당 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 종목 / 지표) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 이미 제작됨. 재무와 역할 중복만 점검; 이번 구현 보류 | 산식·기준 시각·부족 데이터 처리 |
| 종목 | 뉴스 | 종목 관련 기사·공시·일정 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 종목 / 뉴스) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 미연결과 실제 결과 없음 구분; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 자산관리 | 요약 | 총자산·구성·최근 거래, 예수금 모달 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 자산관리 / 요약) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 예수금 포함 총자산 유지, 당일/정산 예정 임시 표시; 이번 구현 보류 | DC-1 settled/amount/pending+asOf 및 compatibility; 예수금 상세 임시 |
| 자산관리 | 보유종목 | 수량·평균단가·평가액·손익·정렬 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 자산관리 / 보유종목) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 펼침형 없음, 높이·기업 심볼 정리; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 자산관리 | 거래내역 | 기간·매수/매도 필터·거래량/금액·목록 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 자산관리 / 거래내역) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 월간 고정 아님. 최신 수정은 구문 확인만 완료; 이번 구현 보류 | 장부·정산·비용 계약; CSV 임시 |
| 자산관리 | 거래 상세 | 계좌·수량·체결가·비용·일지 연결·취소/정정 안내 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 자산관리 / 거래 상세) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 취소·정정은 임시, 최신 수정은 브라우저 재검증 필요; 이번 구현 보류 | DC-2 void/correctionOf; 비용 미확인; ledger_revision #64 v3 |
| 자산관리 | 연결 일지 | 거래에서 연결된 일지 보기 | 02-current/stockbook-mobile-trade-detail-integration-review.html (거래 상세→연결 일지) + five-topics 보완안 | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 일지 상세와 동일 화면으로 재사용; 중복 구현하지 않음 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 일지 | 목록 | 종목별 기록·필터·초안 진입 | 02-current/stockbook-mobile-trade-detail-integration-review.html + 03-journal-patches/stockbook-journal-filter.html | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 최신 필터 보완본과 통합 대조; 이번 구현 보류 | 연결 거래/비용/초안 저장 계약; 내용 유지·자동 삭제 금지 |
| 일지 | 상세 | 한 종목의 매매·이유·계좌/수량·손익·멘털 | 03-journal-patches/stockbook-journal-five-topics.html + reasons/mental/trade-result 보완본 | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 5개 주제 서식을 후보 대표로 지정; 통합본과 차이 기록 후 승인 대기 | 연결 거래/비용/초안 저장 계약; 내용 유지·자동 삭제 금지 |
| 일지 | 입력 | 주제별 접기/펴기·거래 연결·저장/이탈/재개 | 03-journal-patches/stockbook-journal-resume.html + leave/save-failure/link-trades 보완본 | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 주제 접기/펴기·입력 보존·초안 재개 정합; 임의 통합하지 않음 | 연결 거래/비용/초안 저장 계약; 내용 유지·자동 삭제 금지 |
| 공통 | 설정 | 설정과 공통 기능 진입 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 공통 / 설정) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 하단 도구 바로 위 공통 기능 배치, 고정 여부 미결정; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 공통 | 계좌 | 계좌 정보·갱신 및 실패 상태 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 공통 / 계좌) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 계좌 관련 보조 상태는 별도 파일도 보존; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |
| 공통 | 인증 | 인증 진입·상태 | 02-current/stockbook-mobile-trade-detail-integration-review.html (화면: 공통 / 인증) | 시안 존재; 최종 승인 근거 없음 | 로컬/저장소 독립 프로토타입에 구현 없음; PC는 재사용 대상 아님 | 실제 인증 구현 승인과 구분; 이번 구현 보류 | Shared Contract·Provider·식별/기준시각·사용자 승인 대기 |

## 충돌·차이 기록

- 홈·뉴스공시는 01-approved를 우선한다. 02-current에 포함됐다는 이유로 다른 화면의 승인 상태를 올리지 않는다.
- 통합본 일지 상세에는 매수/매도·이유·다른 기회 등 기존 구성이 남아 있다. 최신 five-topics는 언제/얼마·왜·계좌/수량·손익·멘털의 5주제이며 별도 보완본이다. 자동 합치지 않는다.
- 입력·저장 실패·이탈·재개·거래 연결은 일지의 상태/주제 보완이다. 9개 독립 도구 화면을 추가하지 않는다. 현재 프로토타입에 일지 입력 코드가 없으므로 입력 보존 검증은 아직 대상 아님.
- 재무: 기존 통합본의 매출액/영업이익/영업활동현금흐름/자산·부채·자본과 막대+선·표를 대표로 지정. archive의 finance-current/readable-density/bar-line은 수정 이력. 새 카드 세트 제작하지 않음.
- 사업·지표·자산·보유·거래는 통합본을 기준 후보로 유지. 최신 거래/거래 상세 브라우저 검증은 전체 앱 미승인 영역 검증 과제로 남김.
- 시장 업종·테마는 작은 아이콘+이름+보조정보+수치의 세로 행과 더보기로 된 카드 하나. 과거 그리드/별도 시장 메인 시안은 채택하지 않음.
- 04-archive의 해외·통화전환, 분리 탭 일지, 큰 업종 그리드는 현재 방향에 우선하지 않는다.
- 원본 ZIP에 들어 있는 문서의 제안/설명은 자료로 읽었으며 사용자의 이번 지시보다 우선하는 명령으로 실행하지 않았다.

## 기존 코드 범위

- main 77c7497은 PC Electron/Pages 앱이며 Legacy PWA/TWA 폐기 상태. 해당 PC 코드를 모바일에 이식하지 않는다.
- 이전 시장/70종 로컬 프로토타입은 이 환경에 없어 대화 보고만 존재한다. 현재 첨부 통합본과 동일하다고 가정하지 않는다.
- 실제 비교 가능한 기존 모바일 UI 코드는 2026-10-19 작성된 /workspace/stockbook-home-news 독립 프로토타입이다. 이번 PR은 이 코드를 검토용 docs 경로로 전달한다.
- 데이터 연결·AI 결과·정산·기업 분류 신규 구현 없음.

## 뉴스 읽기 최신 지시

사용자는 2026-10-20 기사 클릭의 목적지를 외부 링크가 아닌 프로그램 내 리딩으로 정정하고 승인했다. PR #76의 외부 원문 동작 설명과 차이가 있으며 최신 사용자 지시를 반영한다. 리딩은 별도 도구/중복 카드 세트가 아니라 뉴스의 하위 탐색 상태다. 본문 계약은 미확정이므로 예시 설명만 표시하고, 외부 원문은 보조 링크로 유지한다.
