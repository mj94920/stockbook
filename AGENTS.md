# AGENTS.md — StockBook (Codex / ChatGPT 등 Claude 외 에이전트용)

이 저장소의 **모든 개발 규칙은 [`CLAUDE.md`](CLAUDE.md) 가 원본**이다. 작업 전에 반드시 읽고 그대로 따른다.
UI 작업이면 [`docs/UI-REVAMP-PLAN.md`](docs/UI-REVAMP-PLAN.md) (디자인 토큰 표 포함)도 읽는다.
아래는 핵심 요약과, Claude 자동 개발과 **같은 저장소를 함께 쓰기 위한 추가 규칙**이다.

## 핵심 규칙 요약 (상세는 CLAUDE.md)

- 접근 금지 폴더: `독새`, `지소차트`, `키움증권REST API코드`
- **버전 번호·`CHANGELOG.md` 직접 수정 금지** — 릴리스 워크플로가 자동 처리
- 커밋 메시지: Conventional Commits + 한국어 요약 (`feat(ui): …`, `fix: …`). 버전 증가 수준이 여기서 정해진다
- 커밋 전 `npm test` 통과 필수 (최초 1회 `npm ci && npm run test:setup`)
- `scripts/` 의 검사를 느슨하게 고쳐 통과시키지 않는다
- Electron 보안 설정(`contextIsolation: true`, `nodeIntegration: false`) 변경 금지, Windows 빌드는 NSIS 전용
- 모달·오버레이에 `backdrop-filter` 금지, DOM 요소 참조는 null 안전하게 (CLAUDE.md §3)
- UI 는 `--sb-*` 디자인 토큰과 `.sb-*` 공통 컴포넌트만 사용, 새 하드코딩 색상 금지
- 비밀값(API 키·keystore) 커밋 금지

## Claude 작업 큐와 함께 쓰는 규칙

Claude 는 `queue` 라벨 이슈를 번호 순서대로 하나씩 처리한다 (`claude/*` 브랜치). 충돌을 피하려면:

1. **작업 시작 전 확인**: `in-progress` 라벨이 붙은 열린 이슈가 있으면 그 이슈가 다루는 화면/영역은 건드리지 않는다.
   `queue` 라벨 이슈들의 범위(UI 개편 단계)도 미리 구현하지 않는다 — 그건 큐의 몫이다.
2. **브랜치**: `codex/<짧은-설명>` 으로 만든다. main 에 직접 푸시하지 않는다.
3. **PR**: main 대상으로 연다. 제목은 Conventional Commits 형식 (squash 머지 시 커밋 제목이 됨).
   본문에 관련 이슈가 있으면 `Closes #N`.
4. **머지**: Codex PR 은 자동 머지되지 않는다. 사람(MJ)이 검토 후 `automerge` 라벨을 붙이면
   CI(정적 검사 + 스모크 테스트) 통과 시 squash 머지되고 릴리스된다.
5. **CI 실패 시**: Actions 로그와 Artifacts 의 `smoke-shots`(다크/라이트 스크린샷)를 보고 같은 브랜치에 수정 커밋을 올린다.
6. 작은 단위로 자주: 한 PR 은 한 가지 목적. `index.html` 대규모 재작성은 큐 작업과 충돌하므로 피한다.

## Android 2.0 관련

- Legacy PWA/TWA(`mobile.html`, 루트 `manifest.json`, `sw.js`)는 복원하지 않는다. StockBook Android 2.0 은 그 복구가 아니라 신규 Kotlin 클라이언트다.
- `android/`·`shared/` 는 `CLAUDE.md` §8 의 단계(현재 단계의 이슈)에 해당할 때만 건드린다. 뒤 단계를 미리 구현하지 않는다. `android/` 는 Android Gate 통과 전에는 만들지 않는다.
- 종목 식별: 내부 관계는 `assetId`(불변 영속 ID)만 쓴다. `stockCode`(+`market`)는 외부 시장 식별자이며 관계 키가 아니다 (#47).
- Android 워크플로(`android-*.yml`)와 Windows 워크플로(`ci.yml`·`release.yml`)는 분리돼 있다. 워크플로 변경은 사람 PR 로만 반영한다.

## 저장소 구조 (요약)

```
index.html   ← PC 앱 본체 (Electron 메인 창 · Pages). Legacy 모바일(PWA/TWA)은 폐기됨
shared/      ← (예정) PC·Android 공유 데이터 규격·fixture·규칙 문서. 실행 코드 없음
android/     ← (예정) StockBook Android 2.0 (Kotlin 신규, PC 코드 재사용 없음). CLAUDE.md §8 게이트 이후에만 생성
main.js / preload.js ← Electron 메인·IPC (외부 API 는 여기서 호출 → IPC)
scripts/     ← check-syntax · smoke · bump-version
.github/     ← ci · claude · queue · release 워크플로 (수정은 사람 PR 로만)
docs/        ← UI-REVAMP-PLAN.md 외 문서
```
