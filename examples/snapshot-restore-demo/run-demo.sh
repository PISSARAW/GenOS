#!/usr/bin/env bash
# Drives the genos CLI through the snapshot / restore scenario.
# Every step is a real CLI call: no JSON editing, no LLM.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
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

# Capture stdout (the JSON) and echo it so callers can extract fields while
# still seeing the result.
run_genos_json() {
	local out
	out="$(run_genos "$@")"
	printf '%s\n' "$out"
}

# Pull a top-level string/number field out of a single-line JSON object.
json_field() {
	local json="$1"
	local field="$2"
	printf '%s' "$json" \
		| grep -o "\"$field\": *\"[^\"]*\"" \
		| head -n 1 \
		| sed 's/.*: *"//; s/"$//'
}

json_number() {
	local json="$1"
	local field="$2"
	printf '%s' "$json" \
		| grep -o "\"$field\": *[0-9]*" \
		| head -n 1 \
		| sed 's/.*: *//'
}

# The snapshot store resolves ids to the *last* line matching the id (it's
# append-only). The demo reads the rewound snapshot through the store to
# confirm the rewind also survives a round-trip, not just the file the
# previous command happened to write.
counter_value_in_snapshot() {
	local path="$1"
	counter_value_in_json "$(cat "$path")"
}

# Pull the value of the working-memory item whose key is `counter` out of a
# pretty-printed JSON snapshot. The CLI emits pretty JSON, so the key and
# value live on separate lines — a single-line regex won't find them.
counter_value_in_json() {
	local json="$1"
	# Match the `{ "key": "counter", "value": "<x>" }` record across lines,
	# drop NUL/newline, then strip everything up to and including the value
	# key + opening quote, and everything from the next `"` onward.
	printf '%s' "$json" \
		| grep -Pzo '\{[^{}]*"key": *"counter"[^{}]*"value": *"[^"]*"[^{}]*\}' \
		| tr -d '\0\n' \
		| head -n 1 \
		| sed -E 's/.*"value": *"([^"]*)".*/\1/'
}

# --- layout -----------------------------------------------------------------

demo_dir=".genos/demo/snapshot-restore"
snapshot_store="$demo_dir/agent-snapshots.jsonl"
event_store="$demo_dir/agent-events.jsonl"
agent_path="$demo_dir/agent-a.json"
s0_path="$demo_dir/snapshot-s0.json"
# Original-saved snapshot copied to a stable file before any writes, so the
# final `snapshot compare` step can reference it as `--b` by file path
# regardless of what subsequent commands wrote to the store.
s0_saved_copy="$demo_dir/snapshot-s0-original.json"

rm -rf "$demo_dir"
mkdir -p "$demo_dir"

# --- 0. build ---------------------------------------------------------------

echo "[0/5] build the genos CLI"
run_cargo build -p genos-cli

# --- 1. init + create agent A + snapshot S0 with counter=10 ----------------

echo "[1/5] init + create agent A and snapshot S0 with counter=10"
run_genos init
run_genos agent create --name snapshot-restore --role tester \
	--out "$agent_path" --format json
run_genos snapshot create \
	--agent "$agent_path" \
	--out "$s0_path" \
	--memory counter=10 \
	--format json
# Persist S0 in the store under its own id. Restore later references it by
# this id (and the store resolves it to the *latest* line with that id).
run_genos snapshot save --snapshot "$s0_path" \
	--store "$snapshot_store" --format json
saved_id="$(json_field "$(cat "$s0_path")" snapshot_id)"
[ -n "$saved_id" ] || { echo "could not extract S0 snapshot_id" >&2; exit 1; }
# Keep a separate file copy of the original snapshot so we can compare
# against it later by file path. The store resolves ids to the *latest*
# line, so it can't serve this purpose after restore writes a second line.
cp "$s0_path" "$s0_saved_copy"

# --- 2. set counter=50 on S0 (advance the cursor) ---------------------------

echo "[2/5] write counter=50 on S0 (advanced the cursor by one event)"
# Note: no `--save` here. Saving the post-write snapshot would overwrite the
# line in the store that we're about to point `--source` at; the store is
# append-only and `get_snapshot` returns the latest line with the id, so a
# second save would make restore a no-op against itself.
set_var_out="$(run_genos_json snapshot set-var \
	--snapshot "$s0_path" \
	--key counter \
	--value 50 \
	--events "$event_store" --emit-events \
	--format json 2>/dev/null)"
set_var_sequence="$(json_number "$set_var_out" event_sequence)"
[ "$set_var_sequence" = "1" ] \
	|| { echo "expected first set-var event_sequence=1, got $set_var_sequence" >&2; exit 1; }
[ "$(counter_value_in_snapshot "$s0_path")" = "50" ] \
	|| { echo "expected counter=50 after set-var, got $(counter_value_in_snapshot "$s0_path")" >&2; exit 1; }

# --- 3. restore S0 to the saved snapshot (counter=10) -----------------------

echo "[3/5] restore S0 to the saved snapshot (counter goes 50 -> 10)"
restore_out="$(run_genos_json snapshot restore \
	--snapshot "$s0_path" \
	--source "$saved_id" \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--expect-same-state \
	--format json 2>/dev/null)"
restore_sequence="$(json_number "$restore_out" event_sequence)"
restore_previous="$(json_number "$restore_out" previous_sequence)"
[ "$restore_sequence" = "2" ] \
	|| { echo "expected restore event_sequence=2, got $restore_sequence" >&2; exit 1; }
[ "$restore_previous" = "1" ] \
	|| { echo "expected restore previous_sequence=1, got $restore_previous" >&2; exit 1; }

# After restore the file on disk should read counter=10 again. The rewound
# snapshot is the same snapshot_id, agent_id and branch_id as before — only
# the logical state changed.
[ "$(counter_value_in_snapshot "$s0_path")" = "10" ] \
	|| { echo "expected counter=10 after restore, got $(counter_value_in_snapshot "$s0_path")" >&2; exit 1; }

# The restored-fields list must name the working memory and the two cursor
# fields (counter rewound, cursor advanced past the Restored event).
if ! printf '%s' "$restore_out" | grep -q '"restored_fields"'; then
	echo "expected restored_fields list in output, got: $restore_out" >&2
	exit 1
fi
for field in 'state.working_memory' 'state.event_cursor.sequence' 'state.event_cursor.last_event_id'; do
	if ! printf '%s' "$restore_out" | grep -q "\"$field\""; then
		echo "expected $field in restored_fields, got: $restore_out" >&2
		exit 1
	fi
done

# --- 4. history is still visible --------------------------------------------

echo "[4/5] replay S0's stream — set-var (50), restored — both still on the branch"
run_genos replay basic \
	--events "$event_store" \
	--snapshot "$s0_path" \
	--expect-last-sequence 2 \
	--format json

# The event store file is append-only by construction; reading it raw lists
# both events in order with the expected types. We use grep on the raw JSONL
# because there's no command that prints every event — `replay basic`
# collapses them to counters, which is exactly what the previous assertion
# already covered.
event_lines="$(grep -c '"sequence"' "$event_store")"
[ "$event_lines" = "2" ] \
	|| { echo "expected 2 events on disk, got $event_lines" >&2; exit 1; }
first_event_type="$(grep -o '"event_type": *"[^"]*"' "$event_store" | sed 's/.*: *"//; s/"$//' | sed -n '1p')"
second_event_type="$(grep -o '"event_type": *"[^"]*"' "$event_store" | sed 's/.*: *"//; s/"$//' | sed -n '2p')"
[ "$first_event_type" = "memory_updated" ] \
	|| { echo "expected first event type=memory_updated, got $first_event_type" >&2; exit 1; }
[ "$second_event_type" = "restored" ] \
	|| { echo "expected second event type=restored, got $second_event_type" >&2; exit 1; }

# The snapshot store also keeps both the saved and the rewound S0 line
# (append-only: same id appears twice in the JSONL). `snapshot list` returns
# unique ids, so this is still one id.
list_json="$(run_genos_json snapshot list --store "$snapshot_store" --format json)"
list_count="$(json_number "$list_json" count)"
[ "$list_count" = "1" ] \
	|| { echo "expected snapshot list to report count=1 (S0), got $list_count" >&2; exit 1; }

# Re-resolving S0 through the store must still show counter=10 — the rewind
# survives a round-trip, not just the file the previous command wrote.
resolved="$(run_genos_json snapshot get --snapshot-id "$saved_id" --store "$snapshot_store" --format json)"
resolved_counter="$(counter_value_in_json "$resolved")"
[ "$resolved_counter" = "10" ] \
	|| { echo "expected resolved counter=10, got $resolved_counter" >&2; exit 1; }

# --- 5. restore distinguishes itself from a fork ---------------------------

echo "[5/5] rewound S0 keeps its branch_id (restore != fork)"
# Compare the rewound S0 against the original saved snapshot. After restore
# S0 has counter=10 (matches the saved copy) but its event cursor now points
# at the Restored event (sequence=2 vs the saved sequence=0). Identity is
# preserved on both sides.
compare_out="$(run_genos_json snapshot compare \
	--a "$s0_path" \
	--b "$s0_saved_copy" \
	--format json 2>/dev/null)"

# After restore S0 is logically equal to the saved S0 aside from the cursor
# (which now points at the Restored event). Identity stays the same:
# same snapshot_id, same agent_id, same branch_id — that's the whole point
# of restore vs fork.
if ! printf '%s' "$compare_out" | grep -q '"same_logical_state": *false'; then
	echo "expected comparison.same_logical_state=false after restore, got: $compare_out" >&2
	exit 1
fi
if ! printf '%s' "$compare_out" | grep -q '"distinct_snapshot_id": *false'; then
	echo "expected comparison.distinct_snapshot_id=false (restore preserves id), got: $compare_out" >&2
	exit 1
fi
if ! printf '%s' "$compare_out" | grep -q '"distinct_branch_id": *false'; then
	echo "expected comparison.distinct_branch_id=false (restore stays on branch), got: $compare_out" >&2
	exit 1
fi

echo ""
echo "Demo OK: counter=10 -> snapshot -> counter=50 -> restore -> counter=10"
echo "history stays visible: $(grep -c '"sequence"' "$event_store") events on the branch stream"
echo "saved_id=$saved_id"
echo "snapshot_store=$snapshot_store"
echo "event_store=$event_store"
echo "s0_path=$s0_path"