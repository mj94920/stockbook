# Stock Book

나만의 주식 포트폴리오 관리 앱 — Windows(Electron) · 웹 브라우저

- 웹: https://mj94920.github.io/stockbook/ (PC 화면과 같은 `index.html`)
- 설치 파일: [Releases](../../releases/latest) — `Stock Book Setup x.y.z.exe`
- Legacy 모바일(Android TWA·PWA)은 2026-10 폐기했다. 복원하지 않는다.
- Kotlin 기반 신규 클라이언트 **StockBook Android 2.0** 은 별도 계획으로 준비 중이다 (PC 기반 데이터 구조 정리 이후 착수, 기록은 `CLAUDE.md` §8).

## 개발 방식 — 이슈만 쓰면 끝

1. **Issues → New issue → ✨ 기능 요청 / 🐛 버그 신고** 템플릿으로 작성
2. Claude 가 자동으로 코드 수정 → 검사 → PR → main 머지
3. 릴리스가 자동으로 버전을 올리고 EXE 를 빌드해 Releases 에 올리고, 웹(Pages)도 갱신

여러 단계짜리 큰 작업은 이슈에 `queue` 라벨을 붙이면 번호 순서대로 하나씩 자동 처리된다 (실패 시 큐 정지).
각 CI 실행의 Artifacts 에 다크/라이트 화면 스크린샷이 남는다.

진행 상황은 이슈 댓글과 **Actions** 탭에서 볼 수 있다. 추가 지시는 이슈/PR 댓글에 `@claude …`.
자세한 규칙은 [CLAUDE.md](CLAUDE.md). ChatGPT Codex 는 [AGENTS.md](AGENTS.md) 규칙으로 `codex/*` 브랜치 PR 을 올리고, 검토 후 `automerge` 라벨을 붙이면 머지·배포된다.

## 최초 1회 설정

| # | 할 일 | 위치 |
|---|------|------|
| 1 | (선택) Claude GitHub App 설치 — 없어도 동작, 설치 시 댓글이 claude[bot] 이름으로 표시 | https://github.com/apps/claude |
| 2 | 시크릿 `CLAUDE_CODE_OAUTH_TOKEN` 추가 — 터미널에서 `claude setup-token` 실행 후 출력값 (Pro/Max 구독). API 과금을 쓰려면 대신 `ANTHROPIC_API_KEY` | Settings → Secrets and variables → Actions → Secrets |
| 3 | Workflow 권한: **Read and write** + **Allow GitHub Actions to create and approve pull requests** 체크 | Settings → Actions → General → Workflow permissions |

## 로컬 개발 (선택)

```bash
npm ci
npm start      # Electron 실행
npm run test:setup   # 최초 1회: Playwright/Chromium 설치
npm test             # 정적 검사 + 스모크 테스트
```
