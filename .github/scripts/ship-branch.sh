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

# 머지 실패는 조용히 끝나면 큐가 in-progress 로 영영 멈춘다 → 반드시 needs-human 으로 알린다
hold() {
  gh pr edit "$pr" --repo "$REPO" --add-label needs-human || true
  msg="⚠️ $1 PR #$pr 을 확인해 주세요. 해결 후 PR 을 머지하거나, PR 에 \`@claude\` 로 지시하면 됩니다."
  gh pr comment "$pr" --repo "$REPO" --body "$msg" || true
  [ -n "$ISSUE" ] && [ "$ISSUE" != "$pr" ] && gh issue comment "$ISSUE" --repo "$REPO" --body "$msg" || true
  exit 1
}

# 큐 작업 중 릴리스가 main 에 버전 커밋을 올려 생기는 충돌을 머지 전에 해소
bash "$(dirname "$0")/sync-main.sh" "$BRANCH" \
  || hold "main 과 충돌이 있어 자동 머지를 보류했습니다 (버전 문자열 외의 충돌)."

# ── 머지 직전 Android 가드 (CLAUDE.md §8-3-9, 10) ──────────────────────────────────────────
# Android(android/) 변경이 포함된 PR 은 자동 머지하지 않는다. 이 경로의 검증(verify)에는 Android CI 가 없다.
# 변경 파일을 판정하지 못한 경우(unknown)도 안전한 쪽으로 보류한다.
# 검사 뒤에 커밋이 더해지면 검사 결과가 무효이므로, 머지할 커밋(sha)을 먼저 확정하고
#   ① 그 sha 기준으로 판정 → ② 판정 사이에 브랜치가 움직이지 않았는지 재확인 → ③ 같은 sha 일 때만 머지(--match-head-commit)
# sync-main 이 방금 푸시했을 수 있으므로 sha 는 PR 이 아니라 브랜치 ref 에서 읽고, PR 이 따라올 때까지 잠시 기다린다.
branch_sha() { gh api "repos/$REPO/git/ref/heads/$BRANCH" --jq .object.sha 2>/dev/null || true; }
sha=$(branch_sha)
[ -n "$sha" ] || hold "브랜치 $BRANCH 의 최신 커밋을 확인하지 못해 자동 머지를 보류했습니다."
prhead=""
for i in 1 2 3 4 5 6; do
  prhead=$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq .headRefOid 2>/dev/null || true)
  [ "$prhead" = "$sha" ] && break
  sleep "${SHIP_SLEEP:-5}"
done
[ "$prhead" = "$sha" ] || hold "PR 의 HEAD 가 브랜치 최신 커밋(${sha:0:7})과 일치하지 않아 자동 머지를 보류했습니다."
scope=$(bash "$(dirname "$0")/pr-scope.sh" "$pr" "$sha")
android=$(printf '%s\n' "$scope" | sed -n 's/^android=//p')
[ "$android" = "false" ] \
  || hold "Android(android/) 변경이 포함되었거나 변경 파일을 확인하지 못해(android=${android:-unknown}) 자동 머지를 보류했습니다. Android PR 은 사람이 검토하고 머지합니다."
[ "$(branch_sha)" = "$sha" ] || hold "Android 변경 여부를 검사하는 동안 브랜치에 새 커밋이 추가되어 자동 머지를 보류했습니다."

gh pr edit "$pr" --repo "$REPO" --add-label automerge
merged=false
for i in 1 2 3 4 5 6; do   # 방금 푸시한 머지 커밋의 mergeable 계산을 잠시 기다린다
  # --match-head-commit: 검사한 sha 와 다르면 머지가 거부된다 (검사 이후의 커밋이 섞여 들어가지 못함)
  if gh pr merge "$pr" --repo "$REPO" --squash --delete-branch --match-head-commit "$sha"; then merged=true; break; fi
  sleep "${SHIP_SLEEP:-10}"
done
[ "$merged" = true ] || hold "자동 머지에 실패했습니다."
echo "PR #$pr 머지 완료"

# 이슈 정리 — GITHUB_TOKEN 머지는 'Closes #N' 자동 종료가 보장되지 않으므로 직접 닫는다 (큐가 다음 항목으로 넘어가는 조건)
if [ -n "$ISSUE" ] && [ "$(gh issue view "$ISSUE" --repo "$REPO" --json state --jq .state 2>/dev/null)" = "OPEN" ] \
   && [ "$(gh pr view "$ISSUE" --repo "$REPO" --json number --jq .number 2>/dev/null)" = "" ]; then
  gh issue edit "$ISSUE" --repo "$REPO" --remove-label in-progress || true
  gh issue close "$ISSUE" --repo "$REPO" --reason completed --comment "✅ PR #$pr 로 완료되어 main 에 반영했습니다." || true
fi

# GITHUB_TOKEN 머지는 push 이벤트를 발생시키지 않으므로 릴리스를 직접 호출
gh workflow run release.yml --repo "$REPO" --ref main
echo "릴리스 워크플로 트리거 완료"

# 작업 큐: 다음 'queue' 이슈 시작 (queue.yml 이 없거나 큐가 비었으면 아무 일도 없음)
gh workflow run queue.yml --repo "$REPO" --ref main 2>/dev/null && echo "작업 큐 다음 항목 요청" || true
