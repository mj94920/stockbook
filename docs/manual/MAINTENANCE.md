# 사용 설명서 관리 기록

이 파일은 작성·검토 담당자를 위한 기록이다. 사용자는 docs/USER-MANUAL.md를 읽는다.

- 작성 기준: 2026-10-22, 앱 소스 2f15ce7c8187b6b1a5c2c13e065d19b52a831a0b.
- 본문에는 사용자의 작업 순서, 실제 버튼명, 입력 예시, 저장 후 확인할 결과를 싣는다. PR 상태·커밋·내부 구현·향후 설계는 본문에 넣지 않는다.
- overview/settings/backup.png는 새 브라우저의 빈 상태에서 촬영했다.
- add-watch/add-account/record-buy/holdings-example/journal-example.png는 개인 정보 없는 설명용 입력으로 실제 폼을 조작해 촬영했다. 계좌번호·키 미입력. 가격70,000원·수량10주는 사용법 설명이며 실제 시세/거래가 아니다.
- 설명용 계좌 추가 → 삼성전자 직접 추가 → 매수 한 건 저장 → 보유10주·평균단가70,000 확인까지 정상 동작했다. 일지 초안 편집과 저장 후 입력란 갱신에는 아래 오류를 관찰했다.
- 웹 브라우저에서 외부 요청은 막았다. 증권사 로그인·실시간 조회·Windows 설치 검증과 구분한다.
- 지원 범위: KIS 연동 중심, 타 증권사 입력창과 실제 지원은 다를 수 있음. Firebase·온라인 동기화 미연결. 확장 차트는 docs/design/desktop-chart-proof/2026-10-22의 별도 실험본. Android는 별도 개발 준비 단계.
- 예수금에는 기존 합계/폴백 계산이 남아 있음. 사용자 설명에서는 증권사의 실제 거래 가능액과 대조하도록 안내한다.
- 상태 저장은 localStorage 및 Electron 로컬 파일. API 인증은 별도 암호화 파일. 백업 JSON은 현재 state 전체, 복원은 병합이 아닌 덮어쓰기.
- 신뢰성·미구현 사항의 기술 상세는 별도 실험 README, USER-FORMULAS, 설계문서를 참고한다.

## 일지 화면의 확인된 기존 오류

`sbDesktopMount`가 journal-section을 details로 교체하면서 j_buySection/j_sellSection ID를 보존하지 않는다. toggleJournalFields는 해당 요소가 있다고 가정해 style을 읽는다. editJournal 및 saveJournal 뒤 clearJournalForm에서 TypeError가 발생했다. saveJournal은 이 오류 전에 state 저장과 목록 렌더를 수행하므로 설명용 메모의 저장 자체는 확인됐다. 이 결과를 완전한 일지 편집·저장 성공으로 보고하지 않는다. 사용자 본문에는 중복 저장 전에 목록을 확인하도록 안내한다. 이 문서 작업에서 앱 코드는 변경하지 않았다.
