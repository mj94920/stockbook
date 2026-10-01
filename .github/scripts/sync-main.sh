#!/usr/bin/env bash
# 작업 브랜치에 최신 main 을 머지해 푸시한다 (squash 머지 전 충돌 제거).
#   사용: sync-main.sh <branch>
#   종료코드: 0 = 최신 상태 또는 동기화 완료 / 1 = 사람이 풀어야 하는 충돌
# 필요 env: GH_TOKEN, GITHUB_REPOSITORY
#
# 왜 필요한가: 큐는 이전 PR 머지 직후 다음 이슈를 시작하는데, 같은 시각 릴리스가
# main 에 "chore(release)" 커밋으로 버전 문자열(Stock Book vX.Y.Z 등)을 바꾼다.
# 작업 브랜치가 그 줄 근처를 고쳤다면 PR 이 충돌(dirty) 상태가 되어 머지가 실패한다.
# 버전 문자열만 다른 충돌은 기계적으로 풀 수 있으므로 여기서 자동 해결한다.
set -euo pipefail

BRANCH="$1"
REPO="$GITHUB_REPOSITORY"
DIR="$(mktemp -d)"; TMP="$(mktemp -d)"
trap 'rm -rf "$DIR" "$TMP"' EXIT

git clone --quiet --filter=blob:none --no-checkout \
  "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" "$DIR"
cd "$DIR"
git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout --quiet "$BRANCH"

if git merge-base --is-ancestor origin/main HEAD; then
  echo "브랜치 $BRANCH 는 이미 main 최신 상태"
  exit 0
fi

if git merge --no-edit origin/main >/dev/null 2>&1; then
  echo "main 을 $BRANCH 에 머지 (충돌 없음)"
else
  # 릴리스 전용 파일 — 작업 브랜치는 수정하지 않으므로(CLAUDE.md §1-2) main 쪽을 택한다
  RELEASE_FILES="package.json package-lock.json sw.js android/twa-manifest.json CHANGELOG.md"
  ver=$(git show origin/main:package.json | sed -n 's/^  "version": "\([^"]*\)".*/\1/p')
  norm() { sed -E 's/Stock Book v[0-9]+\.[0-9]+\.[0-9]+/Stock Book v__SB_VERSION__/g'; }

  for f in $(git diff --name-only --diff-filter=U); do
    if [[ " $RELEASE_FILES " == *" $f "* ]]; then
      git checkout --theirs -- "$f"
    else
      # 세 버전 모두 버전 문자열을 자리표시자로 바꾼 뒤 3-way 머지 → 깨끗하면 충돌은 버전뿐
      for s in 1 2 3; do git show ":$s:$f" 2>/dev/null | norm > "$TMP/stage$s" || : > "$TMP/stage$s"; done
      if ! git merge-file -p "$TMP/stage2" "$TMP/stage1" "$TMP/stage3" > "$TMP/merged"; then
        echo "::error::$f 에 버전 문자열 외의 충돌이 있습니다"
        git merge --abort
        exit 1
      fi
      sed "s/Stock Book v__SB_VERSION__/Stock Book v${ver}/g" "$TMP/merged" > "$f"
    fi
    git add -- "$f"
  done
  git commit --quiet --no-edit
  echo "main 을 $BRANCH 에 머지 (버전 문자열 충돌 자동 해결 → v${ver})"
fi

git push --quiet origin "HEAD:$BRANCH"
