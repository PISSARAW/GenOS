#!/usr/bin/env bash
set -euo pipefail

# backend-ci.sh — local mirror of .github/workflows/backend-validation.yml
# Usage: bash scripts/ci/backend-ci.sh [quality|procedural|validation|all]

set -x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
REPORT_DIR="$BACKEND/reports"
mkdir -p "$REPORT_DIR"

MODE="${1:-all}"

run_quality() {
  echo "==> Quality gate"
  python3 "$ROOT/scripts/ci/check_code_quality.py" --strict --report-json "$REPORT_DIR/quality.json"
}

run_procedural() {
  echo "==> Procedural organism suite"
  (cd "$BACKEND" && npm run test:procedural)
}

run_validation() {
  echo "==> Validation safety suite"
  (cd "$BACKEND" && npm run test:validation)
}

case "$MODE" in
  quality) run_quality ;;
  procedural) run_procedural ;;
  validation) run_validation ;;
  all)
    run_quality
    run_procedural
    run_validation
    ;;
  *) echo "Unknown mode: $MODE" >&2; exit 2 ;;
esac

echo "==> done"
