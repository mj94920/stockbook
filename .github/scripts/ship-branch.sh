#!/usr/bin/env bash
# Claude 가 작업한 브랜치를 PR 로 만들고, 검사 통과 시 main 에 머지 후 릴리스를 트리거한다.
#   사용: ship-branch.sh <branch> <issue_or_pr_number> <merge:true|false>
# 필요 env: GH_TOKEN, GITHUB_REPOSITORY
set -euo pipefail

BRANCH="$1"; ISSUE="${2:-}"; MERGE="${3:-true}"
REPO="$GITHUB_REPOSITORY"

ahead=$(gh api "repos/$REPO/compare/main...$BRANCH" --jq '.ahead_by' 2>/dev/null || echo 0)
if [ "${ahead:-0}" = "0" ]; then
  echo "브랜치 $BRANCH 에 main 대비 새 커밋이 없음 → 배포할 것 없음"
  exit 0
fi

gh label create automerge  --repo "$REPO" --color 0E8A16 --description "CI 통과 시 자동 머지" --force >/dev/null 2>&1 || true
gh label create needs-human --repo "$REPO" --color D93F0B --description "자동 수정 실패 — 사람 확인 필요" --force >/dev/null 2>&1 || true

pr=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [ -z "$pr" ]; then
  # PR 제목 = 브랜치 첫 커밋 제목 (Conventional Commits → 릴리스 버전 수준 결정에 쓰임)
  title=$(gh api "repos/$REPO/compare/main...$BRANCH" --jq '.commits[0].commit.message' | head -n1)
  body="자동 생성된 PR — Claude 작업 브랜치 \`$BRANCH\`"
  [ -n "$ISSUE" ] && body="$body"$'\n\n'"Closes #$ISSUE"
  url=$(gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "${title:-chore: Claude 자동 작업}" --body "$body")
  pr="${url##*/}"
  echo "PR 생성: $url"
fi

if [ "$MERGE" != "true" ]; then
  gh pr edit "$pr" --repo "$REPO" --add-label needs-human
  msg="⚠️ 자동 검사(정적 검사/스모크 테스트)를 통과하지 못해 자동 머지를 보류했습니다. PR #$pr 을 확인해 주세요. 수정이 필요하면 PR 에 \`@claude\` 로 지시하면 됩니다."
  [ -n "$ISSUE" ] && gh issue comment "$ISSUE" --repo "$REPO" --body "$msg" || true
  exit 0
fi

gh pr edit "$pr" --repo "$REPO" --add-label automerge
gh pr merge "$pr" --repo "$REPO" --squash --delete-branch
echo "PR #$pr 머지 완료"

# GITHUB_TOKEN 머지는 push 이벤트를 발생시키지 않으므로 릴리스를 직접 호출
gh workflow run release.yml --repo "$REPO" --ref main
echo "릴리스 워크플로 트리거 완료"
