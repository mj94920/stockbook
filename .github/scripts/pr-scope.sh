#!/usr/bin/env bash
# PR 이 바꾼 파일 목록을 GitHub API 로 가져와 검사·머지 범위를 판정한다.
#   사용: pr-scope.sh <pr_number> [head_sha]        필요 env: GH_TOKEN, GITHUB_REPOSITORY
#   head_sha 를 주면 'PR 의 현재 HEAD 가 정확히 그 커밋일 때만' 그 커밋 기준으로 판정한다 (compare API).
#     PR HEAD 가 다르거나(검사 뒤 새 커밋) 아직 반영 전이면 unknown. 자동 머지 직전 판정은 항상 이 모드로 쓴다.
#   출력(stdout, 항상 2줄, 종료코드 0):
#     windows=true|false          Windows 검사를 실행해야 하는가.  false = android/ 만 바꾼 PR 이 확인된 경우뿐
#     android=true|false|unknown  android/ 를 건드리는가.         false = 건드리지 않음이 확인된 경우뿐
#   판정 실패(API 오류·응답 잘림·빈 PR)는 안전한 쪽으로 처리한다: windows=true(검사 실행), android=unknown(자동 머지 금지).
#   호출자는 android 가 정확히 "false" 일 때만 자동 머지를 진행해야 한다 (CLAUDE.md §8-3-9, 10).
#   이름이 바뀐 파일은 이전 경로(previous_filename)도 변경 경로로 취급한다 (src/ → android/ 이동 시 src/ 쪽 변경이 가려지지 않게).
set -uo pipefail

PR="${1:?pr number}"
HEAD_SHA="${2:-}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY}"

emit() { echo "windows=$1"; echo "android=$2"; exit 0; }

json=""; total=""
# 목록 조회 (3회 재시도). head_sha 가 있으면 compare API(그 커밋 기준)로, 없으면 PR 파일 API 로 가져온다.
# 두 방식 모두 목록 개수가 PR 의 changed_files 와 같을 때만 신뢰한다 → 반영 지연·응답 잘림은 unknown 이 된다.
fetch() {
  local i meta pr_head base
  for i in 1 2 3; do
    if [ -n "$HEAD_SHA" ]; then
      if meta=$(gh api "repos/$REPO/pulls/$PR" --jq '[.head.sha, .base.ref, .changed_files] | @tsv' 2>/dev/null) \
         && IFS=$'\t' read -r pr_head base total <<<"$meta" \
         && [ "$pr_head" = "$HEAD_SHA" ] && [[ "$total" =~ ^[0-9]+$ ]] \
         && json=$(gh api "repos/$REPO/compare/${base}...${HEAD_SHA}?per_page=100" --paginate 2>/dev/null \
                   | jq -s '[.[].files // []] | add // []' 2>/dev/null); then
        return 0
      fi
    else
      if json=$(gh api "repos/$REPO/pulls/$PR/files?per_page=100" --paginate 2>/dev/null | jq -s 'add // []' 2>/dev/null) \
         && total=$(gh api "repos/$REPO/pulls/$PR" --jq .changed_files 2>/dev/null) \
         && [[ "$total" =~ ^[0-9]+$ ]]; then
        return 0
      fi
    fi
    sleep "${SCOPE_SLEEP:-$((i * 2))}"
  done
  return 1
}

fetch || emit true unknown

count=$(jq 'length' <<<"$json" 2>/dev/null) || emit true unknown
# 목록이 PR 의 실제 변경 수와 다르거나(API 는 3000개까지만 돌려준다) 비어 있으면 판정하지 않는다
[[ "$count" =~ ^[0-9]+$ ]] && [ "$count" -gt 0 ] && [ "$count" = "$total" ] || emit true unknown

mapfile -t paths < <(jq -r '.[] | .filename, (.previous_filename // empty)' <<<"$json") || emit true unknown
[ "${#paths[@]}" -gt 0 ] || emit true unknown

has_android=false; has_other=false
for p in "${paths[@]}"; do
  case "$p" in
    android/*) has_android=true ;;
    *)         has_other=true ;;
  esac
done

if $has_other; then windows=true; else windows=false; fi
emit "$windows" "$has_android"
