#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_path="$script_dir/examples/counterfactual-demo/run-demo.sh"

if [[ ! -f "$script_path" ]]; then
  echo "Script not found: $script_path" >&2
  exit 1
fi

exec "$script_path"
