# 뉴스 읽기와 차트 작업 영역

2026-10-23 KST 확인. 검토 PR [#92](https://github.com/mj94920/stockbook/pull/92), 브랜치 `codex/news-reader-chart-workspace`. 착수 원격·PR HEAD는 `5b9eeaf924aa082af411a9e4c9de6157ed1af310`, Draft·미병합이다. main은 `2f15ce7`이다. 병합·배포하지 않는다.

## 뉴스: 현재 동작

- 시장 뉴스는 실제 응답이 확인된 `/api/news/list?category=mainnews`를 사용한다. 시장 목록의 `tit/ohnm/subcontent`와 종목 목록의 `title/officeName/body` 차이를 처리한다.
- 제목·실제 언론사·발행 시각(KST, 제공된 초 포함)·네이버 기사 URL·수신 요약을 유지한다. 목록의 body/subcontent를 기사 전체로 표시하지 않는다.
- 목록과 본문 요청은 메인 프로세스에서 처리하고 기존 preload IPC를 사용한다. 메인 화면 송신자를 검사하며 목록 주소는 코드로 고정한다. 본문은 허용된 HTTPS 네이버 기사 경로만 읽는다. 임의 URL을 대신 조회하지 않는다.
- 본문은 HTML 실행 없이 텍스트로 표시한다. 빈 본문·수신 실패는 **수신 요약**과 원문 링크로 안내한다. 사진·표를 포함한 원형 재현은 미구현이다.
- 긴 본문은 읽기 영역 안에서 스크롤한다. 다른 기사를 선택하면 읽기 위치를 맨 위로 돌린다. 이전 기사·종목의 늦은 응답은 현재 선택을 덮지 않는다.
- 목록 수신 중 경제지표·공시 탭으로 옮겨도 새로고침 버튼이 비활성으로 남지 않는다.
- 블로터는 외부 바로가기까지다. 블로터 직접 목록·본문 파서, 네이버에서 원 언론사 사이트 URL을 추출하는 경로는 실제 본문 응답 확인 후 진행한다.

## 검증 범위

| 구분 | 결과 |
| --- | --- |
| 실제 HTTPS 목록 | 시장 30건·삼성전자 20건, 각 HTTP 200. 세션 프록시와 Node 뉴스 서비스를 함께 검증 |
| 실제 기사 본문 | 네이버 뉴스 접속이 프록시 CONNECT 403. HTML 미수신·본문 실수신 미검증 |
| 블로터 직접 연결 | 홈페이지 접속이 프록시 CONNECT 403. 원문 구조 미확인·파서 미추가 |
| 로컬 기사 검사 | 합성 HTML의 텍스트 추출·빈 본문·잘린 본문·허용 URL·송신자 검사 |
| 브라우저 검사 | 긴 본문 스크롤·기사/종목 전환·늦은 응답·탭 전환·수신 요약 표시 |
| 전체 검사 | `npm test`: 추가 검사 10건과 기존 정적·스모크 검사 통과 |
| Windows Electron·NSIS | 실행 환경이 없어 미검증. Windows 테스트 직전 해당 브랜치를 `git pull --ff-only origin codex/news-reader-chart-workspace` 후 HEAD 확인 |

실제 수신 기록은 [network-result.json](network-result.json), 목록 회귀 자료는 [test/fixtures/news](../../../test/fixtures/news/README.md)에 있다. HTTPS 검증은 세션 프록시를 이용한 Node 서비스 검사이며 Windows Electron의 네트워크 동작을 검증한 것이 아니다.

## 직접 화면 보기

[preview.html](preview.html)을 내려받아 브라우저로 연다. **2026-10-23 수신 목록 스냅샷**을 보여주며, 본문은 미연결이므로 수신 요약을 표시한다. 실시간 갱신·Electron 실행 결과가 아니다. 추가 자료 요청 없이 동작하도록 코드·자료를 포함했다. 클라우드에서는 관리 정책상 직접 파일 열기 대신 동일 HTML을 내부 HTTP로 검증했다.

```sh
node docs/design/news-chart-workspace/build-preview.cjs
node docs/design/news-chart-workspace/verify-preview.cjs
```

검증 시 Playwright가 필요하다. 시스템 Chromium 사용 환경은 `CHART_CHROMIUM_PATH=/usr/bin/chromium`을 지정한다. 소스 변경 후 미리보기와 [뉴스 화면](news.png)을 함께 갱신한다.

## 차트: 현재 상태 유지

- 종합의 차트/호가/기업정보 탭과 별도 상세 창, 선택 종목·기간 따라가기/고정을 유지한다.
- 상세 캔들 최대 420px / 거래량 56px / 투자자별 순매수 84px. 작은 창에서는 스크롤을 허용한다.
- A/D 누적 추정선은 제거된 상태를 유지한다. 음양음·새 거래량 평균·MACD 대체식은 추가하지 않는다.
- 삼성전자 일봉 1,000개와 투자자별 5거래일 순매수 보존 자료만 연결한다. 자동 갱신되지 않으며 다른 종목에는 재사용하지 않는다.
- 1/3/6개월·1년은 일봉 조회 범위다. 주봉·월봉 주기 선택이 아니다. 실시간 일봉·확대/이동·십자선 동기화는 미연결이다.
- 출처·해시는 [PROVENANCE.md](../../../src/chart/PROVENANCE.md), 원본 수식은 [6d143e4의 기록](https://github.com/mj94920/stockbook/blob/6d143e4a0860f3f23341723fcf28d877bd061a68/docs/design/desktop-chart-proof/2026-10-22/USER-FORMULAS.md)을 보존한다.
- 데스크톱 대조와 상태 분리 설계는 [CHART-REVIEW.md](CHART-REVIEW.md)를 따른다. 확정 전 지표를 구현하지 않는다.

## 재개 조건

뉴스 도메인 `n.news.naver.com`, `www.bloter.net`, `bloter.net`을 추가한 환경 설정 초안을 저장했다. 기존 `fchart.stock.naver.com`, `m.stock.naver.com`은 보존했다. 초안 저장만으로 실행 환경의 허용 상태가 바뀌지 않는다. 설정 적용 후 실제 응답을 재확인한다.

그 뒤 네이버 기사 본문·원 언론사 링크를 대조하고, 블로터 홈페이지와 실제 기사에서 수신 경로·본문 구조를 확인한 다음 파서를 연결한다. 합성 기사 검사나 외부 바로가기를 본문 연동 완료로 보고하지 않는다.

#85의 렌더러 파일은 현재 원격 `debb8b9` 기준 동일한 blob(`7e3c1f0`)이다. main.js의 준비 실패 시 스플래시 닫기·오류 안내·종료, 실행별 임시 폴더 등록, will-quit에서 자기 폴더만 정리하는 흐름도 유지한다. #92에는 별도 차트 창 닫기가 더해져 있다. 통합 시 이를 비교하며 #85 전체가 포함됐다고 간주하지 않는다.
