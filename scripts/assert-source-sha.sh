#!/usr/bin/env bash
set -euo pipefail

expected_sha="${1:-}"
if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character lowercase Git commit SHA." >&2
  exit 2
fi

actual_sha="$(git rev-parse HEAD)"
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "Source mismatch: checked out $actual_sha, expected $expected_sha." >&2
  exit 1
fi
