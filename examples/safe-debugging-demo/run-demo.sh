#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

echo "[0/1] Build the GenOS CLI"
cargo build --quiet -p genos-cli

echo "[1/1] Run safe parallel debugging"
node "$script_dir/run-demo.mjs" "$repo_root/target/debug/genos"
