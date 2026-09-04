#!/usr/bin/env bash
set -euo pipefail

base_sha="${1:-}"
head_sha="${2:-HEAD}"

git rev-parse --verify "${head_sha}^{commit}" >/dev/null

if [[ -n "$base_sha" && ! "$base_sha" =~ ^0+$ ]] && git rev-parse --verify "${base_sha}^{commit}" >/dev/null 2>&1; then
  revision_range="${base_sha}..${head_sha}"
else
  revision_range="$head_sha"
fi

# Match identities used by generative assistants, without rejecting ordinary
# platform automation such as Dependabot or GitHub's merge committer.
ai_name_pattern='(^|[^[:alnum:]])(codex|chatgpt|claude([[:space:]]+code)?|gemini|copilot|ai[[:space:]_-]*assistant|artificial[[:space:]_-]*intelligence)([^[:alnum:]]|$)'
ai_email_pattern='(codex@openai\.com|claude@anthropic\.com|gemini@google\.com|copilot@github\.com|@[[:alnum:]._-]*genos\.local)'
trailer_pattern='^(co-authored-by|signed-off-by|assisted-by|generated-by):'

failed=0
while IFS= read -r commit_sha; do
  [[ -n "$commit_sha" ]] || continue

  author_name="$(git show -s --format='%an' "$commit_sha")"
  author_email="$(git show -s --format='%ae' "$commit_sha")"
  committer_name="$(git show -s --format='%cn' "$commit_sha")"
  committer_email="$(git show -s --format='%ce' "$commit_sha")"
  identities="${author_name} <${author_email}> ${committer_name} <${committer_email}>"

  if printf '%s\n' "$identities" | grep -Eiq "${ai_name_pattern}|${ai_email_pattern}"; then
    printf 'AI identity rejected in commit %s: %s\n' "$commit_sha" "$identities" >&2
    failed=1
  fi

  while IFS= read -r trailer; do
    [[ -n "$trailer" ]] || continue
    if printf '%s\n' "$trailer" | grep -Eiq "${ai_name_pattern}|${ai_email_pattern}"; then
      printf 'AI attribution trailer rejected in commit %s: %s\n' "$commit_sha" "$trailer" >&2
      failed=1
    fi
  done < <(git show -s --format='%B' "$commit_sha" | grep -Ei "$trailer_pattern" || true)
done < <(git rev-list --reverse "$revision_range")

if [[ "$failed" -ne 0 ]]; then
  printf 'Every GenOS commit must name an accountable human author. See CONTRIBUTING.md.\n' >&2
  exit 1
fi

printf 'Human authorship metadata: ok\n'
