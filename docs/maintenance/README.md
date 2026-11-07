# 프로젝트 코드 정리 — 2026-11-07

기준 커밋: `840f371f095c603137ebadd24dc60af60cbf4c5a`
검토 브랜치: `codex/project-code-cleanup`

이번 정리는 기존 기능을 보존하면서 코드의 가독성과 배포 검증을 개선한다. 구조 개편 전체나 데이터 공급·AI 실연결의 완료를 뜻하지 않는다. 병합·배포 승인은 별도다.

## 변경과 근거

| 영역 | 결과 |
|---|---|
| 읽기 쉬운 코드 | main/preload, src의 수작업 JS·CJS·CSS, 테스트에 Prettier 3.6.2 적용. 첫 서식 작업 58개 파일 중 JS/CJS 54개는 직전 코드와 AST 동등성을 확인했다. CSS 4개에는 AST 동등성을 주장하지 않는다. |
| 기존 검사 보존 | 기존 테스트 18개 파일의 assert 호출을 기준 커밋과 비교해 보존을 확인했다. 공통 HTTP 서버로 12개 중복 서버 구현을 통합했다. |
| 실행되지 않는 코드 | index.html의 초기 switchSubTab stub에서 무조건 return 뒤의 47개 줄만 제거했다. 나중에 정의되는 MDI 구현과 초기 함수 바인딩은 유지했다. |
| EXE 자산 누락 | build.files에서 빠진 src/screener/**를 추가했다. 기존 설정에서는 배포된 렌더러가 조건검색 자산을 찾지 못하는 상황을 음성 사례로 재현했다. |
| 렌더러 준비 | JS뿐 아니라 로컬 CSS·아이콘·이미지 참조도 확인한다. 누락 시 자신이 만든 임시 디렉터리만 정리한다. 기존 심볼릭 링크 차단은 유지한다. |
| 배포 검증 | build.files로 구성한 모의 설치 디렉터리에서 종합 화면을 열고 거래대금 조건 추가까지 검사한다. 실제 electron-builder/Windows 설치 검사를 대체하지 않는다. |
| 미리보기 생성 | 세 생성기의 JS/CSS 인라인 처리를 공통화했다. 뉴스 생성기의 오래된 자산 목록 누락을 수정했다. 차트 생성기에 같은 누락이 있었다고 단정하지 않는다. 출력 경로 인자로 임시 파일 검증이 가능하다. |
| 검사 범위 | 외부 런타임 JS 전체 문법 검사, 배포 자산·오프라인 자산 처리 검사를 추가하고 기존 디자인 미리보기 검사를 npm test에 포함했다. |

서식 적용 전후 해시와 AST·기존 assert 확인 결과는 [format-validation.json](format-validation.json)에 있다. AST 확인은 서식 작업 자체의 동등성에 한정되며, 의도적으로 변경한 자산 검사·서버 통합 전체가 기준 커밋과 동일하다는 뜻은 아니다. 이후 추가한 미리보기 검사 파일은 이 58개 기록에 포함하지 않는다.

## 보존한 범위

- 버전·CHANGELOG, 보호된 scripts와 워크플로, Electron 보안 설정, NSIS 설정은 변경하지 않았다.
- SQLite·assetId·계좌·장부 이관과 기존 예수금 계산 순서는 건드리지 않았다.
- 원본 자산·승인 화면·기존 preview.html·고정 증거 데이터·생성 업종 목록은 재생성하거나 삭제하지 않았다.
- HOME 연결을 전제로 한 새 기능, 데이터 계약, AI 모델 실호출은 추가하지 않았다.

## 검증과 재현

```bash
npm ci
npm run test:setup  # Playwright 최초 설치
npm run format:check
npm test
```

이 환경에서는 Node 22와 시스템 Chromium을 사용했다. 전체 검사 **145개 통과, 실패·건너뜀 0개**, 스모크 통과, 서식 검사 통과. 기존/신규 엔진 판정 비교 **3,796개 일치**. 상세 결과는 [verification.json](verification.json)에 기록한다.

생성기는 기본 출력 대신 별도 경로로 확인할 수 있다. 기존 승인 산출물을 의도 없이 덮어쓰지 않는다.

```bash
node docs/design/data-research-ai/build-preview.cjs /tmp/stockbook-ai.html
node docs/design/news-chart-workspace/build-preview.cjs /tmp/stockbook-news.html
node docs/design/chart-trading-value/build-preview.cjs /tmp/stockbook-chart.html
```

Windows/NSIS 설치·실행, 증권사 실수신, 모델 실연결은 미실행이다. GitHub API 접근 제한 때문에 진행 중인 Claude 이슈·큐와 원격 PR 상태의 최신 확인은 불가하다. 충돌 여부는 병합 전에 담당자가 확인해야 한다. 현재 CI는 정적 검사와 스모크 중심이므로 로컬의 전체 145개 검사 통과를 CI 전체 실행으로 표현하지 않는다. 워크플로 확장은 별도 검토 대상이며 이번에는 변경하지 않았다.

## 다음 정리 순서

1. 이번 브랜치의 변경을 검토하고 Windows에서 조건검색·차트·뉴스를 확인한다.
2. [기존 구조 개편 계획](../STRUCTURE-REVAMP-PLAN.md)과 진행 중인 큐를 재확인해 index.html의 상태·UI·네트워크 경계를 작은 단위로 분리한다. 계좌·장부·저장소는 해당 단계의 보존·이관 조건을 지킨다.
3. 기능별 데이터 출처·단위·기준일·누락 규칙을 정리하고 한 종목의 수집→리서치→AI 분석 흐름을 실연결로 검증한다. 이번 코드 정리의 완료와 구분한다.

index.html은 여전히 큰 레거시 진입점이다. 이번 변경은 이를 한꺼번에 다시 쓰지 않았으며 전체 모듈 분리를 완료한 것으로 보고하지 않는다.
