#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
MODE="smoke"

usage() {
  printf 'Usage: %s [--smoke|--full]\n' "$0"
}

for argument in "$@"; do
  case "$argument" in
    --smoke) MODE="smoke" ;;
    --full) MODE="full" ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; usage >&2; exit 2 ;;
  esac
done

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

install_node_dependencies() {
  local directory="$1"
  printf '\nInstalling locked npm dependencies in %s\n' "$directory"
  (cd "${REPO_ROOT}/${directory}" && npm ci)
}

require_command cargo
require_command node
require_command npm
require_command rustc

printf 'GenOS validation (%s)\n' "$MODE"
printf 'Node %s / npm %s / Rust %s\n' "$(node --version)" "$(npm --version)" "$(rustc --version)"

for lockfile in \
  research/reverse-game-of-life/package-lock.json \
  backend/package-lock.json \
  studio/package-lock.json; do
  test -f "${REPO_ROOT}/${lockfile}" || {
    printf 'Missing lockfile: %s\n' "$lockfile" >&2
    exit 1
  }
done

printf '\nChecking Cargo workspace metadata\n'
(cd "$REPO_ROOT" && cargo metadata --locked --no-deps --format-version 1 >/dev/null)

install_node_dependencies research/reverse-game-of-life
install_node_dependencies backend
install_node_dependencies studio

printf '\nChecking JavaScript entrypoints\n'
(cd "$REPO_ROOT" && node --check backend/test_agent_runtime_adapter.js)
(cd "$REPO_ROOT" && node --check backend/src/services/agentRuntimeAdapter.js)
(cd "${REPO_ROOT}/backend" && node test_agent_runtime_adapter.js)
(cd "${REPO_ROOT}/studio" && node test_static_compliance.mjs)

if [ "$MODE" = "full" ]; then
  printf '\nRunning the complete locked Cargo workspace test suite\n'
  (cd "$REPO_ROOT" && cargo test --workspace --locked)
fi

printf '\nValidation completed successfully (%s).\n' "$MODE"
