# 승인·검토 자료 목록

2026-10-21 KST. 이 목록의 GitHub 등록은 PR 병합·릴리스·후속 구현 승인을 대신하지 않는다.
승인 근거는 이 대화에서 확인된 사용자 지시 및 기존 PR의 근거 문서다. 다른 방의 원문은 재확인하지 않았다.

| 구분 | 승인·지시 범위 | 보존 위치 | 승인에 포함되지 않는 것 |
|---|---|---|---|
| 모바일 디자인 | 홈 통합본·뉴스/공시 통합본 디자인 승인 기록 | [#76 원본·미리보기·manifest](https://github.com/mj94920/stockbook/tree/d3fa9719b840164d0e27a661ef467badac287c74/docs/design/android-ui-v2/v0.3-approved), [#77 코드·화면 대조표](https://github.com/mj94920/stockbook/tree/5a5ec3ec3a22778bacf20830fe27f05e2b361521/docs/design/android-ui-v2/prototypes/home-news) | Android Gate 통과, Android 구현 착수, 미승인 다른 화면·뉴스 수집 정책 확정 |
| 투자 원칙 | 사용자가 표시한 반복 저점과 지지·저항 역할 전환을 원칙 데이터로 바로 반영하도록 지시 | [#74 원칙 문서](https://github.com/mj94920/stockbook/blob/d987a6de3b063ad21084cec966c57ddafa650091/docs/INVESTMENT-PRINCIPLES.md), [JSON](https://github.com/mj94920/stockbook/blob/d987a6de3b063ad21084cec966c57ddafa650091/docs/principles/support-resistance-role-reversal.json) | BB 산식, 수치 임계값, 자동 매매 판단, 매집 완료 단정 |
| CLI 로그인 | 사용자 제공 운영 방향: 기존 공식 CLI 로그인 조회·재사용, 토큰 복사 금지, 로그아웃 영향 안내, 전송 동의 분리, 공개 어댑터 독립 작성 | [#86 운영 기준](https://github.com/mj94920/stockbook/blob/bb53e39/docs/CLI-ACCOUNT-CONNECTION.md) | 실제 로그인·모델 호출·외부 자료 전송, 비공개 코드 공개, D-AI1~4 일괄 승인 |
| 구형 자료 정리 | #75 문서 보관 및 #79 파일 맵 정리 병합 완료 | [main 보관함](https://github.com/mj94920/stockbook/tree/209b392/docs/archive/pre-revamp), [문서 안내](https://github.com/mj94920/stockbook/blob/209b392/docs/README.md) | 미반영 ui-redesign 삭제, legacy PWA/TWA 복원 |
| PC 디자인 | #83 병합·v1.11.0 배포는 확인됨. 이후 사용자 실사용 불합격 피드백이 최신 기준 | [#83](https://github.com/mj94920/stockbook/pull/83), [#87 보완 화면·설명](https://github.com/mj94920/stockbook/tree/bfcbf4bc7571dd4fa687b9ed5972ad7b41b3952f/docs/design/desktop-usage-review) | #83의 최종 디자인 합격, #87 디자인 승인·병합·EXE 검증 |
| 차트 검증 | 사용자가 제품 연결 전 실제 데이터 획득 검증을 지시 | [독립 검증본](chart-proof/README.txt), [당시 획득 결과](chart-data-review.txt) | 공급원 정확성·지속성·Windows Electron 경로 검증 완료, 제품 차트 구현 승인 |

## 아직 결정하지 않은 사항

- #84 통화: A(모르면 빈 값) / B(국내 코드는 KRW로 추정하고 표시). 결정하지 않았다.
- D-AI1~4: 비공개 엔진 공개 복사, 최초 전송 동의 UI, 입력 범위, 결과 저장 방식은 제안과 승인 상태를 구별한다. 명시 지시 없는 공개 복사·전송·저장은 실행하지 않는다.
- 클라우드 D-C1~8: 구조, Cloud Gate, 암호화, broker 동기화 여부, 복원 의미, 공급자, 웹 범위, 휴지통/삭제 마커 기간은 제안 단계다. Supabase는 후보이며 요금은 미검증이다.
- #29 구현 착수·장부·assetId·Android Gate·규칙 엔진 게이트는 각 현행 계약과 이슈에서 재확인한다.

## 옮기지 않은 자료

사용자 실계좌 스크린샷, 계좌번호·별칭·키·토큰, Git 번들 전체는 공개 저장소에 올리지 않았다.
다른 환경의 `/tmp/claude-0/.../scratchpad/REVIEW-nero-arin-cli.md`, `REVIEW-cloud-sync.md`는 이 환경에서 원문을 확인하지 못했다.
대화에 전달된 요지만 인계서에 기록하며 원문 이전 완료로 표시하지 않는다.
