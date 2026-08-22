#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
MODE="--smoke"

case "${1:-}" in
  "") ;;
  --smoke|--full) MODE="$1" ;;
  -h|--help)
    printf 'Usage: %s [--smoke|--full]\n' "$0"
    exit 0
    ;;
  *)
    printf 'Unknown option: %s\n' "$1" >&2
    printf 'Usage: %s [--smoke|--full]\n' "$0" >&2
    exit 2
    ;;
esac

exec "${SCRIPT_DIR}/validate-reproducibility.sh" "$MODE"
