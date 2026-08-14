#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

demo_dir=".genos/demo/divergent-writes"
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

snapshot_id_of() {
	grep -o '"snapshot_id"[^,]*' "$1" | head -n 1 | sed 's/.*: *"//; s/"$//'
}

rm -rf "$demo_dir"
mkdir -p "$demo_dir"

echo "[0/6] build the genos CLI"
cargo build -p genos-cli

echo "[1/6] init + create agent A"
genos init
genos agent create --name divergent-writes --role tester --out "$agent_path" --format json

echo "[2/6] create snapshot S0 with counter=0"
genos snapshot create \
	--agent "$agent_path" \
	--out "$s0_path" \
	--memory counter=0 \
	--format json
genos snapshot save --snapshot "$s0_path" --store "$snapshot_store" --format json

echo "[3/6] fork A1 and A2 from S0 (no LLM call, no JSON editing)"
genos agent fork-from-snapshot \
	--snapshot "$s0_path" \
	--count 2 \
	--out-dir "$fork_dir" \
	--snapshots "$snapshot_store" \
	--save \
	--format json

echo "[4/6] each branch writes counter differently"
genos snapshot set-var \
	--snapshot "$a1_path" \
	--key counter \
	--value 10 \
	--snapshots "$snapshot_store" \
	--save \
	--events "$event_store" \
	--emit-events \
	--format json
genos snapshot set-var \
	--snapshot "$a2_path" \
	--key counter \
	--value 20 \
	--snapshots "$snapshot_store" \
	--save \
	--events "$event_store" \
	--emit-events \
	--format json

echo "[5/6] assert A1.counter=10, A2.counter=20, S0.counter=0"
genos snapshot check-var \
	--key counter \
	--parent "$s0_path" --expect-parent 0 \
	--branch "$a1_path" --expect 10 \
	--branch "$a2_path" --expect 20 \
	--expect-isolated \
	--format json

# Same assertion against the persisted snapshots, resolved by id in the store:
# the divergence must survive the round-trip, not just live in the files the
# last command happened to write.
s0_id="$(snapshot_id_of "$s0_path")"
a1_id="$(snapshot_id_of "$a1_path")"
a2_id="$(snapshot_id_of "$a2_path")"
genos snapshot check-var \
	--key counter \
	--store "$snapshot_store" \
	--parent "$s0_id" --expect-parent 0 \
	--branch "$a1_id" --expect 10 \
	--branch "$a2_id" --expect 20 \
	--expect-isolated \
	--format json

# The two branches now differ on exactly two logical fields: the variable they
# wrote, and the cursor pointing at their own write event.
echo "[6/6] assert the divergence is the only difference, on isolated streams"
genos snapshot compare \
	--a "$a1_path" \
	--b "$a2_path" \
	--expect-differing-field state.working_memory \
	--expect-differing-field state.event_cursor.last_event_id \
	--expect-distinct-identity \
	--format json
genos replay basic --events "$event_store" --snapshot "$a1_path" --expect-last-sequence 1 --format json
genos replay basic --events "$event_store" --snapshot "$a2_path" --expect-last-sequence 1 --format json

echo
echo "Demo OK: S0(counter=0) -> A1(counter=10) | A2(counter=20)"
echo "snapshot_store=$snapshot_store"
echo "event_store=$event_store"
echo "parent_s0=$s0_path"
echo "fork_a1=$a1_path"
echo "fork_a2=$a2_path"
