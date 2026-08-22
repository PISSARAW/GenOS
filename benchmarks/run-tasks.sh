#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

tasks=()
output_dir="benchmarks/results"

while (($#)); do
  case "$1" in
    B02|B05)
      tasks+=("$1")
      shift
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || { echo "--output-dir requires a path" >&2; exit 2; }
      output_dir="$2"
      shift 2
      ;;
    *)
      echo "unsupported task or argument: $1" >&2
      exit 2
      ;;
  esac
done

if ((${#tasks[@]} == 0)); then
  tasks=(B02 B05)
fi

for task in "${tasks[@]}"; do
  node benchmarks/run-safety-benchmarks.mjs --task "$task" --output-dir "$output_dir"
done
