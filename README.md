# Stock Book

나만의 주식 포트폴리오 관리 앱 — Windows(Electron) · Android(TWA) · 웹(PWA)

- 웹/PWA: https://mj94920.github.io/stockbook/ (모바일: `mobile.html`)
- 설치 파일: [Releases](../../releases/latest) — `Stock Book Setup x.y.z.exe`, `Stock Book x.y.z.apk`

## 개발 방식 — 이슈만 쓰면 끝

1. **Issues → New issue → ✨ 기능 요청 / 🐛 버그 신고** 템플릿으로 작성
2. Claude 가 자동으로 코드 수정 → 검사 → PR → main 머지
3. 릴리스가 자동으로 버전을 올리고 EXE·APK 를 빌드해 Releases 에 올리고, 웹(PWA)도 갱신

진행 상황은 이슈 댓글과 **Actions** 탭에서 볼 수 있다. 추가 지시는 이슈/PR 댓글에 `@claude …`.
자세한 규칙은 [CLAUDE.md](CLAUDE.md).

## 최초 1회 설정

| # | 할 일 | 위치 |
|---|------|------|
| 1 | Claude GitHub App 설치 (이 저장소 선택) | https://github.com/apps/claude |
| 2 | 시크릿 `CLAUDE_CODE_OAUTH_TOKEN` 추가 — 터미널에서 `claude setup-token` 실행 후 출력값 (Pro/Max 구독). API 과금을 쓰려면 대신 `ANTHROPIC_API_KEY` | Settings → Secrets and variables → Actions → Secrets |
| 3 | Workflow 권한: **Read and write** + **Allow GitHub Actions to create and approve pull requests** 체크 | Settings → Actions → General → Workflow permissions |
| 4 | (Android 빌드를 원하면) 아래 Android 항목 설정 | 같은 Secrets/Variables 화면 |

### Android APK 자동 빌드 (선택)

설정하지 않으면 APK 단계만 건너뛰고 EXE·웹 배포는 정상 진행된다.

| 종류 | 이름 | 값 |
|------|------|----|
| Variable | `ANDROID_PACKAGE_ID` | 기존 앱의 패키지 ID (예: `io.github.mj94920.twa`) — **기존 설치본과 같아야 업데이트됨** |
| Variable | `ANDROID_KEY_ALIAS` | keystore 의 key alias (기본값 `android`) |
| Secret | `ANDROID_KEYSTORE_BASE64` | keystore 파일을 base64 로 인코딩한 문자열 |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | keystore 비밀번호 |
| Secret | `ANDROID_KEY_PASSWORD` | key 비밀번호 (keystore 비밀번호와 같으면 생략) |

keystore base64 만들기 (Windows PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\경로\android.keystore")) | Set-Clipboard
```

> versionCode 규칙이 `X*10000 + Y*100 + Z` 로 바뀌었다 (예: 1.2.3 → 10203). 예전 규칙(최대 수백)보다 항상 크므로 기존 설치본 위에 업데이트된다.

## 로컬 개발 (선택)

```bash
npm ci
npm start      # Electron 실행
npm run test:setup   # 최초 1회: Playwright/Chromium 설치
npm test             # 정적 검사 + 스모크 테스트
```
