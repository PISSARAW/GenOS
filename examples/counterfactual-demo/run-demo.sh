#!/usr/bin/env bash
set -euo pipefail

echo "[1/6] init"
cargo run -p genos-cli -- init

echo "[2/6] world create"
world_json="$(cargo run -p genos-cli -- world create --provider directory --format json)"
world_id="$(printf '%s' "$world_json" | jq -r '.world_id')"
echo "world_id=$world_id"

echo "[3/6] mutate base world"
printf 'candidate base\n' > ".genos/world/worlds/$world_id/result.txt"

echo "[4/6] snapshot + fork"
snapshot_json="$(cargo run -p genos-cli -- world snapshot --provider directory --world-id "$world_id" --format json)"
snapshot_id="$(printf '%s' "$snapshot_json" | jq -r '.snapshot_id')"
echo "snapshot_id=$snapshot_id"

forks_json="$(cargo run -p genos-cli -- world fork --provider directory --snapshot-id "$snapshot_id" --count 2 --format json)"
world_a="$(printf '%s' "$forks_json" | jq -r '.world_ids[0]')"
world_b="$(printf '%s' "$forks_json" | jq -r '.world_ids[1]')"
echo "world_a=$world_a"
echo "world_b=$world_b"

echo "[5/6] mutate forks"
printf 'branch A\n' > ".genos/world/worlds/$world_a/outcome.txt"
printf 'branch B with extra change\n' > ".genos/world/worlds/$world_b/outcome.txt"

echo "[6/6] diff"
diff_json="$(cargo run -p genos-cli -- world diff --provider directory --world-a "$world_a" --world-b "$world_b" --format json)"
printf '%s\n' "$diff_json"

echo "Done. files_changed=$(printf '%s' "$diff_json" | jq -r '.files_changed')"
