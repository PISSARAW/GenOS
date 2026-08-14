#!/usr/bin/env bash
# Drives the genos CLI through the contradiction detection scenario.
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

# Capture stdout (the JSON) and echo it so callers can extract fields while
# still seeing the result.
run_genos_json() {
	local out
	out="$(run_genos "$@")"
	printf '%s\n' "$out"
}

# Build the JSON-driven path that `cargo run -p genos-cli --` returned into a
# single object so we can extract fields with `sed`. The CLI emits single-line
# JSON with `--format json`.

belief_id_from() {
	local json="$1"
	printf '%s\n' "$json" | grep -o '"belief_id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# --- layout -----------------------------------------------------------------

demo_dir=".genos/demo/belief-contradiction"
snapshot_store="$demo_dir/agent-snapshots.jsonl"
event_store="$demo_dir/agent-events.jsonl"
contradict_log="$demo_dir/contradiction-notice.txt"
agent_path="$demo_dir/agent-a.json"
s0_path="$demo_dir/snapshot-s0.json"

rm -rf "$demo_dir"
mkdir -p "$demo_dir"

# --- 0. build ---------------------------------------------------------------

echo "[0/5] build the genos CLI"
run_cargo build -p genos-cli

# --- 1. init + create agent A + snapshot S0 -------------------------------

echo "[1/5] init + create agent A and snapshot S0"
run_genos init
run_genos agent create --name belief-contradiction --role tester \
	--out "$agent_path" --format json
run_genos snapshot create \
	--agent "$agent_path" \
	--out "$s0_path" \
	--format json
run_genos snapshot save --snapshot "$s0_path" \
	--store "$snapshot_store" --format json

# --- 2. record the first belief (the "yes" claim) ---------------------------

echo "[2/5] record (api, is_bottleneck, true, 0.8) on S0"
first_out="$(run_genos_json snapshot set-belief \
	--snapshot "$s0_path" \
	--subject api --predicate is_bottleneck --object true \
	--confidence 0.8 \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--format json 2>/dev/null)"
first_belief_id="$(belief_id_from "$first_out")"
[ -n "$first_belief_id" ] \
	|| { echo "could not extract first belief_id" >&2; exit 1; }
printf '%s\n' "$first_out" | grep -q '"contradictions": *\[\]' \
	|| { echo "expected first write to have no contradictions, got: $first_out" >&2; exit 1; }

# --- 3. record the contradictory belief (the "no" claim) -------------------

echo "[3/5] record (api, is_bottleneck, false, 0.7) on S0 — triggers detection"
# The contradiction notice prints to stderr. Capture stdout (JSON) and stderr
# separately.
second_stdout_file="$demo_dir/second-belief.json"
second_stderr_file="$demo_dir/second-belief.stderr.txt"
if command -v cargo >/dev/null 2>&1; then
	run_cargo run --quiet -p genos-cli -- snapshot set-belief \
		--snapshot "$s0_path" \
		--subject api --predicate is_bottleneck --object false \
		--confidence 0.7 \
		--snapshots "$snapshot_store" --save \
		--events "$event_store" --emit-events \
		--format json \
		>"$second_stdout_file" 2>"$second_stderr_file"
fi
second_out="$(cat "$second_stdout_file")"
second_stderr="$(cat "$second_stderr_file")"
second_belief_id="$(belief_id_from "$second_out")"
[ -n "$second_belief_id" ] \
	|| { echo "could not extract second belief_id" >&2; exit 1; }
printf '%s\n' "$second_stderr" >"$contradict_log"

# The stderr block must include the literal "CONTRADICTION DETECTED" marker.
if ! printf '%s\n' "$second_stderr" | grep -q "CONTRADICTION DETECTED"; then
	echo "expected stderr to print CONTRADICTION DETECTED, got: $second_stderr" >&2
	exit 1
fi

# The stderr block must name both belief ids.
if ! printf '%s\n' "$second_stderr" | grep -q "$second_belief_id"; then
	echo "expected stderr to mention new belief_id $second_belief_id, got: $second_stderr" >&2
	exit 1
fi
if ! printf '%s\n' "$second_stderr" | grep -q "$first_belief_id"; then
	echo "expected stderr to mention opposing belief_id $first_belief_id, got: $second_stderr" >&2
	exit 1
fi

# --- 4. structured assertions on the snapshot file ---------------------------

echo "[4/5] assert both records are Disputed and reference each other"
snapshot_json="$(cat "$s0_path")"
# Use awk to pull the status of a belief by id: walks the file once and
# reports the first "status" field seen after the matching "id".
disputed_first="$(printf '%s\n' "$snapshot_json" | awk -v id="$first_belief_id" '
	$0 ~ "\"id\": \"" id "\"" { in_record = 1; next }
	in_record && $0 ~ /"status":/ {
		match($0, /"status":[[:space:]]*"([^"]+)"/, m)
		print m[1]
		exit
	}')"
disputed_second="$(printf '%s\n' "$snapshot_json" | awk -v id="$second_belief_id" '
	$0 ~ "\"id\": \"" id "\"" { in_record = 1; next }
	in_record && $0 ~ /"status":/ {
		match($0, /"status":[[:space:]]*"([^"]+)"/, m)
		print m[1]
		exit
	}')"
[ "$disputed_first" = "disputed" ] \
	|| { echo "expected first belief status=disputed, got: $disputed_first" >&2; exit 1; }
[ "$disputed_second" = "disputed" ] \
	|| { echo "expected second belief status=disputed, got: $disputed_second" >&2; exit 1; }

# The contradicts field on each belief must reference the other one.
if ! printf '%s\n' "$snapshot_json" | grep -q "$second_belief_id"; then
	echo "expected first belief to reference $second_belief_id somewhere" >&2
	exit 1
fi
if ! printf '%s\n' "$snapshot_json" | grep -q "$first_belief_id"; then
	echo "expected second belief to reference $first_belief_id somewhere" >&2
	exit 1
fi

# The JSON output for the second write must list the first belief id in
# `contradictions`.
if ! printf '%s\n' "$second_out" | grep -q "$first_belief_id"; then
	echo "expected second output to reference $first_belief_id, got: $second_out" >&2
	exit 1
fi

# --- 5. replay assertion ----------------------------------------------------

echo "[5/5] replay S0's stream — first write, second write, contradiction marker"
run_genos replay basic --events "$event_store" --snapshot "$s0_path" --expect-last-sequence 3 --format json

# Last-event-id sequence count: S0 saw three events (create, update, marker).
last_cursor="$(run_genos snapshot get --snapshot-id "$(printf '%s\n' "$snapshot_json" | grep -o '"snapshot_id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')" --store "$snapshot_store" --format json | grep -o '"sequence": *[0-9]*' | head -1 | sed 's/.*: *//')"
[ "$last_cursor" = "3" ] \
	|| { echo "expected event_cursor.sequence=3 on S0, got $last_cursor" >&2; exit 1; }

echo ""
echo "Demo OK: contradiction detected between (api, is_bottleneck, true, 0.8) and (api, is_bottleneck, false, 0.7)"
echo "first_belief_id=$first_belief_id"
echo "second_belief_id=$second_belief_id"
echo "snapshot_store=$snapshot_store"
echo "event_store=$event_store"
echo "parent_s0=$s0_path"
echo "contradiction_stderr=$contradict_log"
