# PR 초안

Base: `main`
Head: `codex/context-tabs-20261107`
코드 검증 SHA: `92b1d5c87ab1d94431f832057a48fecade9257d7`

제목: fix(ui): 종합 호가 자동 조회와 기업·재무정보 탭 연결

종합 화면에서 호가 탭을 눌러도 조회 대기로 남고 기업정보 탭에는 시세 요약만 보이던 문제를 개선합니다. 호가는 탭 진입·선택 종목 변경 시 자동 조회하고, 기업정보는 기존 IPC로 기업 지표와 최근 실제 연간 재무표를 탭 안에 표시합니다.

- 종목 전환 시 이전 자료와 지연 응답 제거, 조회 시각·부분 실패·12초 대기 제한·재시도 제공
- 0·음수 보존, 예상 연도 제외, 원격 문자열은 textContent로 표시
- 기업정보 성공 자료를 5분 메모리 재사용하고 명시적 새로고침은 무효화
- 최신 main c30b078 기반. 기존 차트·거래대금·수급 구현은 보존

검증: npm test 통과 — 정적 검사, 94개 Node/브라우저 검사, 전체 스모크. 실제 Windows/NSIS 및 KIS·네이버 현재 수신은 사용자 확인 대기입니다.

`scripts/smoke.mjs`의 이전 종목 응답 검사를 새 자동 조회 흐름으로 바꾸고 새 종목 조회 진행을 추가 확인했습니다. 검사 변경에 대한 사람 검토와 `tests-approved` 라벨이 필요하며 자동 부여하지 않았습니다.

검토 자료: docs/design/context-tabs/README.md. Draft 검토용이며 병합·배포 승인이 아닙니다.

## 등록

[제목·요약이 입력된 PR 작성 화면](https://github.com/mj94920/stockbook/compare/main...codex/context-tabs-20261107?expand=1&title=fix%28ui%29%3A+%EC%A2%85%ED%95%A9+%ED%98%B8%EA%B0%80+%EC%9E%90%EB%8F%99+%EC%A1%B0%ED%9A%8C%EC%99%80+%EA%B8%B0%EC%97%85%C2%B7%EC%9E%AC%EB%AC%B4%EC%A0%95%EB%B3%B4+%ED%83%AD+%EC%97%B0%EA%B2%B0&body=%ED%98%B8%EA%B0%80+%ED%83%AD+%EC%A7%84%EC%9E%85%C2%B7%EC%A2%85%EB%AA%A9+%EB%B3%80%EA%B2%BD+%EC%8B%9C+%EC%9E%90%EB%8F%99+%EC%A1%B0%ED%9A%8C%ED%95%98%EA%B3%A0%2C+%EA%B8%B0%EC%97%85%EC%A0%95%EB%B3%B4+%ED%83%AD%EC%97%90+%EA%B8%B0%EC%97%85+%EC%A7%80%ED%91%9C%EC%99%80+%EC%97%B0%EA%B0%84+%EC%9E%AC%EB%AC%B4%ED%91%9C%EB%A5%BC+%ED%91%9C%EC%8B%9C%ED%95%A9%EB%8B%88%EB%8B%A4.%0A%0A%EA%B2%80%EC%A6%9D%3A+%EC%A0%95%EC%A0%81+%EA%B2%80%EC%82%AC%C2%B794%EA%B0%9C+%EA%B2%80%EC%82%AC%C2%B7%EC%A0%84%EC%B2%B4+%EC%8A%A4%EB%AA%A8%ED%81%AC+%ED%86%B5%EA%B3%BC.+Windows+%EB%B0%8F+%EC%8B%A4%EC%A0%9C+%EC%84%9C%EB%B2%84+%EC%88%98%EC%8B%A0%EC%9D%80+%EC%82%AC%EC%9A%A9%EC%9E%90+%ED%99%95%EC%9D%B8+%EB%8C%80%EA%B8%B0%EC%9E%85%EB%8B%88%EB%8B%A4.%0A%0A%EA%B2%80%EC%82%AC+%EC%8A%A4%ED%81%AC%EB%A6%BD%ED%8A%B8+%EB%B3%80%EA%B2%BD%EC%97%90+%EB%8C%80%ED%95%9C+tests-approved+%EA%B2%80%ED%86%A0+%ED%95%84%EC%9A%94.+%EB%B3%91%ED%95%A9%C2%B7%EB%B0%B0%ED%8F%AC+%EC%8A%B9%EC%9D%B8%EC%9D%80+%EB%B3%84%EB%8F%84%EC%9E%85%EB%8B%88%EB%8B%A4.%0A%0A%EA%B2%80%ED%86%A0+%EC%9E%90%EB%A3%8C%3A+docs%2Fdesign%2Fcontext-tabs%2FREADME.md)

GitHub에서 Create draft pull request를 선택해 등록한다. 이 문서만으로 PR이 생성되거나 병합 승인된 것은 아니다.
