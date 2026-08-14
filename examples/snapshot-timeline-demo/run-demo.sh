#!/usr/bin/env bash
# Drives the genos CLI through the snapshot-timeline scenario:
# build a chain S0 -> S1 -> S2 -> S3 (each checkpointing a fresh
# snapshot id on the same branch), then `restore S1` (rewinding S3's
# logical state) and `fork-from-snapshot S1` (minting X1 on a fresh
# branch). Every step is a real CLI call; no JSON editing, no LLM.

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

run_genos_json() {
	local out
	out="$(run_genos "$@")"
	printf '%s\n' "$out"
}

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

# Pull the value of the working-memory item whose key is `counter` out
# of a pretty-printed JSON snapshot. The CLI emits pretty JSON, so the
# key and value live on separate lines — a single-line regex won't find
# them.
counter_value_in_snapshot() {
	local path="$1"
	local json
	json="$(cat "$path")"
	printf '%s' "$json" \
		| grep -Pzo '\{[^{}]*"key": *"counter"[^{}]*"value": *"[^"]*"[^{}]*\}' \
		| tr -d '\0\n' \
		| head -n 1 \
		| sed -E 's/.*"value": *"([^"]*)".*/\1/'
}

short_id_of() {
	local id="$1"
	printf '%s' "$id" | head -c 8
}

# Walk the JSON lineage tree and return the number of children of the
# node whose `snapshot_id` matches `$2`. The CLI emits pretty-printed
# JSON; we walk it line by line tracking brace depth (for objects) and
# bracket depth (for arrays) across the WHOLE file. When we see
# `snapshot_id == target` we save the brace depth just before the line
# as `node_depth`; the target's object closes when brace_depth drops
# below node_depth. While inside the target's `children` array we
# count every `{` that opens a child object — signalled by
# brace_depth == node_depth + 1 (the immediate child layer).
count_children_for() {
	local json="$1"
	local target="$2"
	printf '%s' "$json" | awk -v target="$target" '
		function count_char(line, ch,    n, i) {
			n = 0
			for (i = 1; i <= length(line); i++) {
				if (substr(line, i, 1) == ch) n++
			}
			return n
		}
		BEGIN {
			depth = 0
			arr_depth = 0
			id = ""
			node_depth = -1
			seen_children = 0
			child_count = 0
		}
		{
			line = $0
			opens = count_char(line, "{")
			closes = count_char(line, "}")
			ob = count_char(line, "[")
			cb = count_char(line, "]")
			depth_before = depth
			depth += opens - closes
			arr_depth += ob - cb
			if (node_depth == -1 && match(line, /"snapshot_id": *"/)) {
				val = substr(line, RSTART + RLENGTH)
				endq = index(val, "\"")
				id = substr(val, 1, endq - 1)
				if (id == target) {
					node_depth = depth_before
				}
			}
			if (node_depth >= 0 && depth < node_depth) {
				print child_count
				exit
			}
			if (node_depth >= 0 && !seen_children) {
				if (match(line, /"children": *\[/)) {
					seen_children = 1
					if (line ~ /"children": *\[\s*\{/) child_count = 1
				}
				next
			}
			if (seen_children) {
				if (opens > 0 && depth == node_depth + 1) {
					child_count++
				}
				# The target node has no other arrays at its level;
				# when arr_depth returns to 0 the children array has
				# closed and we leave the scanning state.
				if (arr_depth == 0 && cb > 0) {
					seen_children = 0
				}
			}
		}
		END { if (node_depth == -1) print "0" }
	'
}

list_relations_for() {
	local json="$1"
	local target="$2"
	printf '%s' "$json" | awk -v target="$target" '
		function count_char(line, ch,    n, i) {
			n = 0
			for (i = 1; i <= length(line); i++) {
				if (substr(line, i, 1) == ch) n++
			}
			return n
		}
		BEGIN {
			depth = 0
			arr_depth = 0
			id = ""
			node_depth = -1
			seen_children = 0
		}
		{
			line = $0
			opens = count_char(line, "{")
			closes = count_char(line, "}")
			ob = count_char(line, "[")
			cb = count_char(line, "]")
			depth_before = depth
			depth += opens - closes
			arr_depth += ob - cb
			if (node_depth == -1 && match(line, /"snapshot_id": *"/)) {
				val = substr(line, RSTART + RLENGTH)
				endq = index(val, "\"")
				id = substr(val, 1, endq - 1)
				if (id == target) {
					node_depth = depth_before
				}
			}
			if (node_depth >= 0 && depth < node_depth) exit
			if (node_depth >= 0 && !seen_children) {
				if (match(line, /"children": *\[/)) {
					seen_children = 1
				}
				next
			}
			if (seen_children) {
				if (arr_depth == 0 && cb > 0) {
					seen_children = 0
				} else if (match(line, /"relation": *"/)) {
					val = substr(line, RSTART + RLENGTH)
					endq = index(val, "\"")
					printf "%s ", substr(val, 1, endq - 1)
				}
			}
		}
	'
}

# --- layout -----------------------------------------------------------------

demo_dir=".genos/demo/snapshot-timeline"
snapshot_store="$demo_dir/agent-snapshots.jsonl"
event_store="$demo_dir/agent-events.jsonl"
agent_path="$demo_dir/agent-a.json"
s0_path="$demo_dir/snapshot-s0.json"
s1_path="$demo_dir/snapshot-s1.json"
s2_path="$demo_dir/snapshot-s2.json"
s3_path="$demo_dir/snapshot-s3.json"
forks_dir="$demo_dir/forks"

rm -rf "$demo_dir"
mkdir -p "$demo_dir" "$forks_dir"

# --- 0. build ---------------------------------------------------------------

echo "[0/9] build the genos CLI"
run_cargo build -p genos-cli

# --- 1. init + create agent + snapshot S0 with counter=10 --------------------

echo "[1/9] init + create agent A + snapshot S0 (counter=10)"
run_genos init
run_genos agent create --name snapshot-timeline --role tester \
	--out "$agent_path" --format json
run_genos snapshot create \
	--agent "$agent_path" \
	--out "$s0_path" \
	--memory counter=10 \
	--format json
s0_id="$(json_field "$(cat "$s0_path")" snapshot_id)"
s0_branch="$(json_field "$(cat "$s0_path")" branch_id)"
[ -n "$s0_id" ] || { echo "could not extract S0 snapshot_id" >&2; exit 1; }

# --- 2. set-var counter=20 on S0, then checkpoint to mint S1 ------------------

echo "[2/9] counter=20 on S0, checkpoint -> S1 (fresh id, same branch)"
run_genos_json snapshot set-var \
	--snapshot "$s0_path" \
	--key counter --value 20 \
	--events "$event_store" --emit-events --format json 2>/dev/null > /dev/null
[ "$(counter_value_in_snapshot "$s0_path")" = "20" ] \
	|| { echo "expected counter=20 after set-var, got $(counter_value_in_snapshot "$s0_path")" >&2; exit 1; }

s1_out="$(run_genos_json snapshot checkpoint \
	--snapshot "$s0_path" \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--expect-fresh-id --expect-same-branch \
	--out "$s1_path" --format json 2>/dev/null)"
s1_id="$(json_field "$s1_out" snapshot_id)"
s1_source_id="$(json_field "$s1_out" source_snapshot_id)"
s1_branch="$(json_field "$s1_out" branch_id)"
[ -n "$s1_id" ] || { echo "could not extract S1 snapshot_id" >&2; exit 1; }
[ "$s1_id" != "$s0_id" ] \
	|| { echo "expected S1 != S0, both were $s1_id" >&2; exit 1; }
[ "$s1_source_id" = "$s0_id" ] \
	|| { echo "expected S1's parent to be S0, got $s1_source_id" >&2; exit 1; }
[ "$s1_branch" = "$s0_branch" ] \
	|| { echo "expected S1 to share branch with S0, got $s1_branch vs $s0_branch" >&2; exit 1; }
[ "$(json_number "$s1_out" event_sequence)" = "2" ] \
	|| { echo "expected checkpoint event_sequence=2, got $(json_number "$s1_out" event_sequence)" >&2; exit 1; }

# --- 3. set-var counter=30 on S1, then checkpoint to mint S2 ------------------

echo "[3/9] counter=30 on S1, checkpoint -> S2"
run_genos_json snapshot set-var \
	--snapshot "$s1_path" \
	--key counter --value 30 \
	--events "$event_store" --emit-events --format json 2>/dev/null > /dev/null
[ "$(counter_value_in_snapshot "$s1_path")" = "30" ] \
	|| { echo "expected counter=30 after set-var, got $(counter_value_in_snapshot "$s1_path")" >&2; exit 1; }

s2_out="$(run_genos_json snapshot checkpoint \
	--snapshot "$s1_path" \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--expect-fresh-id --expect-same-branch \
	--out "$s2_path" --format json 2>/dev/null)"
s2_id="$(json_field "$s2_out" snapshot_id)"
s2_source_id="$(json_field "$s2_out" source_snapshot_id)"
[ "$s2_id" != "$s1_id" ] || { echo "expected S2 != S1" >&2; exit 1; }
[ "$s2_source_id" = "$s1_id" ] \
	|| { echo "expected S2's parent to be S1, got $s2_source_id" >&2; exit 1; }

# --- 4. set-var counter=40 on S2, then checkpoint to mint S3 ------------------

echo "[4/9] counter=40 on S2, checkpoint -> S3"
run_genos_json snapshot set-var \
	--snapshot "$s2_path" \
	--key counter --value 40 \
	--events "$event_store" --emit-events --format json 2>/dev/null > /dev/null
[ "$(counter_value_in_snapshot "$s2_path")" = "40" ] \
	|| { echo "expected counter=40 after set-var, got $(counter_value_in_snapshot "$s2_path")" >&2; exit 1; }

s3_out="$(run_genos_json snapshot checkpoint \
	--snapshot "$s2_path" \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--expect-fresh-id --expect-same-branch \
	--out "$s3_path" --format json 2>/dev/null)"
s3_id="$(json_field "$s3_out" snapshot_id)"
s3_source_id="$(json_field "$s3_out" source_snapshot_id)"
[ "$s3_id" != "$s2_id" ] || { echo "expected S3 != S2" >&2; exit 1; }
[ "$s3_source_id" = "$s2_id" ] \
	|| { echo "expected S3's parent to be S2, got $s3_source_id" >&2; exit 1; }
[ "$(counter_value_in_snapshot "$s3_path")" = "40" ] \
	|| { echo "expected counter=40 in S3, got $(counter_value_in_snapshot "$s3_path")" >&2; exit 1; }

# --- 5. restore S3 to S1's state (counter goes 40 -> 20) ----------------------

echo "[5/9] restore S3 to S1 (counter goes 40 -> 20)"
restore_out="$(run_genos_json snapshot restore \
	--snapshot "$s3_path" \
	--source "$s1_id" \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--expect-same-state \
	--format json 2>/dev/null)"
[ "$(json_number "$restore_out" event_sequence)" = "7" ] \
	|| { echo "expected restore event_sequence=7, got $(json_number "$restore_out" event_sequence)" >&2; exit 1; }
[ "$(counter_value_in_snapshot "$s3_path")" = "20" ] \
	|| { echo "expected counter=20 in S3 after restore, got $(counter_value_in_snapshot "$s3_path")" >&2; exit 1; }
# S3 keeps its checkpoint-minted identity.
[ "$(json_field "$restore_out" target_snapshot_id)" = "$s3_id" ] \
	|| { echo "restore changed S3's id" >&2; exit 1; }

# --- 6. fork X1 from S1 (fresh branch, fresh id, counter=20) -----------------

echo "[6/9] fork X1 from S1 (fresh branch, counter=20)"
fork_out="$(run_genos_json agent fork-from-snapshot \
	--snapshot "$s1_id" \
	--count 1 \
	--out-dir "$forks_dir" --out-prefix fork \
	--snapshots "$snapshot_store" --save \
	--events "$event_store" --emit-events \
	--format json 2>/dev/null)"
# The fork output has `forks: Vec<ForkEntry>`; the snapshot_id is
# nested inside the first ForkEntry. Walk the JSON to grab it.
x1_id="$(printf '%s' "$fork_out" | awk '
	function count_char(line, ch,    n, i) {
		n = 0
		for (i = 1; i <= length(line); i++) {
			if (substr(line, i, 1) == ch) n++
		}
		return n
	}
	BEGIN { in_forks = 0; bracket_depth = 0 }
	{
		line = $0
		if (in_forks == 0) {
			if (line ~ /"forks": *\[/) {
				in_forks = 1
				bracket_depth = 1
				next
			}
		}
		if (in_forks == 1) {
			bracket_depth += count_char(line, "[") - count_char(line, "]")
			if (bracket_depth == 0) exit
			if (match(line, /"snapshot_id": *"/)) {
				val = substr(line, RSTART + RLENGTH)
				endq = index(val, "\"")
				print substr(val, 1, endq - 1)
				exit
			}
		}
	}
')"
x1_path="$forks_dir/fork-1.json"
[ -n "$x1_id" ] || { echo "could not extract X1 snapshot_id" >&2; exit 1; }
[ "$x1_id" != "$s1_id" ] || { echo "fork reused S1's id" >&2; exit 1; }
[ "$(counter_value_in_snapshot "$x1_path")" = "20" ] \
	|| { echo "expected X1 counter=20 (inherited from S1), got $(counter_value_in_snapshot "$x1_path")" >&2; exit 1; }

# --- 7. render the lineage tree (text) ---------------------------------------

echo "[7/9] render the lineage tree"
text_tree="$(run_genos snapshot lineage \
	--snapshot "$s0_path" \
	--events "$event_store" \
	--snapshots "$snapshot_store" \
	--format text 2>/dev/null || true)"
echo "----- text tree -----"
printf '%s\n' "$text_tree"
echo "---------------------"
printf '%s\n' "$text_tree" | grep -q "^$(short_id_of "$s0_id")" \
	|| { echo "expected root line starting with $(short_id_of "$s0_id"), got:" "$text_tree" >&2; exit 1; }
# S1 is S0's only child, so it always renders as `└── mutation <short>`.
printf '%s\n' "$text_tree" | grep -qE "[└├]── mutation $(short_id_of "$s1_id")" \
	|| { echo "expected mutation edge to S1 in tree, got:" "$text_tree" >&2; exit 1; }
printf '%s\n' "$text_tree" | grep -qE "[└├]── fork $(short_id_of "$x1_id")" \
	|| { echo "expected fork edge to X1 in tree, got:" "$text_tree" >&2; exit 1; }

# --- 8. machine-readable tree + assertions ----------------------------------

echo "[8/9] machine-readable tree + assertions"
lineage_json="$(run_genos_json snapshot lineage \
	--snapshot "$s0_path" \
	--events "$event_store" \
	--snapshots "$snapshot_store" \
	--format json 2>/dev/null)"

# Total edges: S0->S1 (mutation), S1->S2 (mutation), S2->S3 (mutation),
# S1->X1 (fork), S1->S3 (restore). The restore edge to S3 doesn't add
# to the visible tree (S3 stays anchored under S2 because that's the
# earliest parent), but it IS present on the dag.
[ "$(json_number "$lineage_json" edges)" = "5" ] \
	|| { echo "expected 5 edges in dag, got $(json_number "$lineage_json" edges)" >&2; exit 1; }

# S1 must have exactly two children: S2 (mutation) and X1 (fork).
[ "$(count_children_for "$lineage_json" "$s1_id")" = "2" ] \
	|| { echo "expected S1 to have 2 children, got $(count_children_for "$lineage_json" "$s1_id")" >&2; exit 1; }
s1_relations="$(list_relations_for "$lineage_json" "$s1_id")"
printf '%s' "$s1_relations" | grep -q "mutation" \
	|| { echo "expected a mutation edge under S1, got: $s1_relations" >&2; exit 1; }
printf '%s' "$s1_relations" | grep -q "fork" \
	|| { echo "expected a fork edge under S1, got: $s1_relations" >&2; exit 1; }

# S2 must have exactly one child: S3 (mutation).
[ "$(count_children_for "$lineage_json" "$s2_id")" = "1" ] \
	|| { echo "expected S2 to have 1 child, got $(count_children_for "$lineage_json" "$s2_id")" >&2; exit 1; }

# X1 must be a leaf.
[ "$(count_children_for "$lineage_json" "$x1_id")" = "0" ] \
	|| { echo "expected X1 to be a leaf, got $(count_children_for "$lineage_json" "$x1_id") children" >&2; exit 1; }

# --- 9. summary --------------------------------------------------------------

echo ""
echo "Demo OK: S0 -> S1 -> {S2 -> S3, X1} (5 edges, S1 has 2 children)"
echo "history stays visible: $(grep -c '"sequence"' "$event_store") events on the branch stream"
echo "s0_id=$s0_id"
echo "s1_id=$s1_id"
echo "s2_id=$s2_id"
echo "s3_id=$s3_id"
echo "x1_id=$x1_id"
echo "snapshot_store=$snapshot_store"
echo "event_store=$event_store"
