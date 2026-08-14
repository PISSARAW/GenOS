#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

demo_dir=".genos/demo/clone-without-llm"
snapshot_store="$demo_dir/agent-snapshots.jsonl"
event_store="$demo_dir/agent-events.jsonl"
agent_path="$demo_dir/agent-a.json"
s0_path="$demo_dir/snapshot-s0.json"
fork_dir="$demo_dir/forks"
a1_path="$fork_dir/fork-1.json"
a2_path="$fork_dir/fork-2.json"

genos() {
	cargo run --quiet -p genos-cli -- "$@"
}

rm -rf "$demo_dir"
mkdir -p "$demo_dir"

echo "[0/6] build the genos CLI"
cargo build -p genos-cli

echo "[1/6] init + create agent A"
genos init
genos agent create --name clone-no-llm --role tester --out "$agent_path" --format json

echo "[2/6] create snapshot S0 with a minimal seeded memory"
genos snapshot create \
	--agent "$agent_path" \
	--out "$s0_path" \
	--memory seed_note=minimal-memory \
	--semantic-ref memory-minimal-1 \
	--format json
genos snapshot save --snapshot "$s0_path" --store "$snapshot_store" --format json

echo "[3/6] fork A1 and A2 from S0 (no LLM call, no JSON editing)"
genos agent fork-from-snapshot \
	--snapshot "$s0_path" \
	--count 2 \
	--out-dir "$fork_dir" \
	--snapshots "$snapshot_store" \
	--save \
	--events "$event_store" \
	--emit-events \
	--format json

echo "[4/6] assert same logical state and distinct identity"
genos snapshot compare \
	--a "$a1_path" \
	--b "$a2_path" \
	--expect-same-state \
	--expect-distinct-identity \
	--format json

# Nothing was modified after the fork, so the structural diff must be empty even
# though every identity field differs. This is the baseline the diff semantics
# are defined against.
echo "[5/6] assert the diff between the untouched forks is empty"
genos diff "$a1_path" "$a2_path" --expect-empty --format json

echo "[6/6] assert isolated event streams via replay"
genos replay basic --events "$event_store" --snapshot "$a1_path" --expect-last-sequence 1 --format json
genos replay basic --events "$event_store" --snapshot "$a2_path" --expect-last-sequence 1 --format json

echo
echo "Demo OK: Agent A -> snapshot S0 -> forks A1/A2"
echo "snapshot_store=$snapshot_store"
echo "event_store=$event_store"
echo "fork_a1=$a1_path"
echo "fork_a2=$a2_path"
