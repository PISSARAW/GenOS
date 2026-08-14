#!/usr/bin/env bash
# Drives the genos CLI through the (api, uses, postgres) belief scenario.
# Every step is a real CLI call: no JSON editing, no LLM.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

# --- helpers ----------------------------------------------------------------

if ! command -v cargo >/dev/null 2>&1; then
	echo "cargo not found. Install Rust via rustup (https://rustup.rs)." >&2
	exit 1
fi

run_cargo() {
	cargo "$@"
}

run_genos() {
	run_cargo run --quiet -p genos-cli -- "$@"
}

# Capture the first line of stdout (the JSON) and echo it again so callers can
# pipe it through jq while still seeing the result.
run_genos_json() {
	local out
	out="$(run_genos "$@")"
	echo "$out"
}

# Extract a top-level JSON string field from stdin.
# Usage: echo "$json" | json_field snapshot_id
json_field() {
	local field="$1"
	# Use sed as a portable JSON parser-light. It assumes well-formed single-
	# line output (which the CLI emits in --format json).
	sed -n "s/.*\"${field}\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

# Extract a nested field by dotted path. Used for state.beliefs[*].confidence.
# Usage: echo "$json" | nested_field confidence /path/to/file.json belief_id
# Simpler: just use grep for known patterns.
find_belief_confidence() {
	local snapshot_path="$1"
	local belief_id="$2"
	# Use awk on every platform: avoids the python3 Windows-app-execution-
	# alias that points to the MS Store and breaks the demo on Windows.
	awk -v id="$belief_id" '
		$0 ~ "\"id\": \""id"\"" { found=1 }
		found && $0 ~ /"confidence":/ {
			match($0, /"confidence":[[:space:]]*([0-9.]+)/, m)
			if (m[1] != "") { print m[1]; exit }
		}
	' "$snapshot_path"
}

snapshot_id_from_file() {
	local path="$1"
	grep -o '"snapshot_id": *"[^"]*"' "$path" | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# --- layout -----------------------------------------------------------------

demo_dir=".genos/demo/belief-update"
snapshot_store="$demo_dir/agent-snapshots.jsonl"
event_store="$demo_dir/agent-events.jsonl"
agent_path="$demo_dir/agent-a.json"
s0_path="$demo_dir/snapshot-s0.json"
fork_dir="$demo_dir/forks"
a1_path="$fork_dir/fork-1.json"

rm -rf "$demo_dir"
mkdir -p "$demo_dir" "$fork_dir"

# --- 0. build ---------------------------------------------------------------

echo "[0/6] build the genos CLI"
run_cargo build -p genos-cli

# --- 1. init + create agent A + snapshot S0 ---------------------------------

echo "[1/6] init + create agent A and snapshot S0"
run_genos init
run_genos agent create --name belief-update --role tester \
	--out "$agent_path" --format json
run_genos snapshot create \
	--agent "$agent_path" \
	--out "$s0_path" \
	--format json
run_genos snapshot save --snapshot "$s0_path" \
	--store "$snapshot_store" --format json

# --- 2. record the belief on S0 (confidence 0.9) ---------------------------

echo "[2/6] record (api, uses, postgres) on S0 with confidence 0.9"
add_out="$(run_genos_json snapshot set-belief \
	--snapshot "$s0_path" \
	--subject api --predicate uses --object postgres \
	--confidence 0.9 \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--format json)"
belief_id="$(printf '%s\n' "$add_out" | grep -o '"belief_id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
[ -n "$belief_id" ] || { echo "could not extract belief_id from set-belief output" >&2; exit 1; }

# --- 3. fork A1 from S0 -----------------------------------------------------

echo "[3/6] fork A1 from S0"
run_genos agent fork-from-snapshot \
	--snapshot "$s0_path" \
	--count 1 \
	--out-dir "$fork_dir" \
	--snapshots "$snapshot_store" --save \
	--format json

# --- 4. overwrite the belief's confidence on A1 -----------------------------

echo "[4/6] A1 overwrites the belief to confidence 0.4"
update_out="$(run_genos_json snapshot set-belief \
	--snapshot "$a1_path" \
	--subject api --predicate uses --object postgres \
	--confidence 0.4 \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--format json)"
upd_belief_id="$(printf '%s\n' "$update_out" | grep -o '"belief_id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
upd_previous="$(printf '%s\n' "$update_out" | grep -o '"previous_confidence": *[^,}]*' | head -1 | sed 's/.*: *//')"

# Same belief record, only the confidence moved.
[ "$belief_id" = "$upd_belief_id" ] \
	|| { echo "expected belief_id to be preserved across the fork, got $belief_id vs $upd_belief_id" >&2; exit 1; }
[ "$upd_previous" = "0.9" ] \
	|| { echo "expected previous_confidence=0.9 on the update, got $upd_previous" >&2; exit 1; }

# --- 5. assert per-branch confidence ----------------------------------------

echo "[5/6] assert S0.confidence=0.9, A1.confidence=0.4"
s0_conf="$(find_belief_confidence "$s0_path" "$belief_id")"
a1_conf="$(find_belief_confidence "$a1_path" "$belief_id")"
[ "$s0_conf" = "0.9" ] \
	|| { echo "expected S0 confidence 0.9, got $s0_conf" >&2; exit 1; }
[ "$a1_conf" = "0.4" ] \
	|| { echo "expected A1 confidence 0.4, got $a1_conf" >&2; exit 1; }

# Same assertion against the persisted snapshots, resolved by id in the
# store: the divergence must survive the round-trip, not just live in the
# files the last command happened to write.
s0_id="$(snapshot_id_from_file "$s0_path")"
a1_id="$(snapshot_id_from_file "$a1_path")"
s0_out="$(run_genos snapshot get --snapshot-id "$s0_id" --store "$snapshot_store" --format json)"
a1_out="$(run_genos snapshot get --snapshot-id "$a1_id" --store "$snapshot_store" --format json)"
# Persist to temp files so find_belief_confidence can re-use the parser.
printf '%s' "$s0_out" > "$demo_dir/s0-resolved.json"
printf '%s' "$a1_out" > "$demo_dir/a1-resolved.json"
s0_conf_id="$(find_belief_confidence "$demo_dir/s0-resolved.json" "$belief_id")"
a1_conf_id="$(find_belief_confidence "$demo_dir/a1-resolved.json" "$belief_id")"
[ "$s0_conf_id" = "0.9" ] \
	|| { echo "expected store-resolved S0 confidence 0.9, got $s0_conf_id" >&2; exit 1; }
[ "$a1_conf_id" = "0.4" ] \
	|| { echo "expected store-resolved A1 confidence 0.4, got $a1_conf_id" >&2; exit 1; }

# --- 6. diff + replay assertions --------------------------------------------

echo "[6/6] diff + replay assertions"
# Same fields the working-memory divergent-writes demo asserts, plus the
# belief field that actually changed.
run_genos snapshot compare \
	--a "$s0_path" --b "$a1_path" \
	--expect-differing-field "state.beliefs" \
	--expect-differing-field state.event_cursor.sequence \
	--expect-differing-field state.event_cursor.last_event_id \
	--expect-distinct-identity \
	--format json

# The structural diff: only `confidence` under the belief id moves. No
# subject/predicate/object/status flips, no parallel records.
run_genos diff "$s0_path" "$a1_path" \
	--expect-changed-path "state.beliefs.$belief_id.confidence" \
	--expect-changed-path state.event_cursor.sequence \
	--expect-changed-path state.event_cursor.last_event_id \
	--format text

# Replay: S0 has its `memory_created` (sequence 1). A1 forked from S0 so
# it inherits sequence=1 as its lineage watermark; the A1 update brings its
# stream to sequence 2. Each branch sees only its own event.
run_genos replay basic --events "$event_store" --snapshot "$s0_path" --expect-last-sequence 1 --format json
run_genos replay basic --events "$event_store" --snapshot "$a1_path" --expect-last-sequence 2 --format json

echo ""
echo "Demo OK: S0(confidence=0.9) -> A1(confidence=0.4)"
echo "belief_id=$belief_id"
echo "snapshot_store=$snapshot_store"
echo "event_store=$event_store"
echo "parent_s0=$s0_path"
echo "fork_a1=$a1_path"
