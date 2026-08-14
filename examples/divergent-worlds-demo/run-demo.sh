#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

demo_dir=".genos/demo/divergent-worlds"
world_root="$demo_dir/world"

genos() {
	cargo run --quiet -p genos-cli -- "$@"
}

# Value of a top-level string field in a genos JSON output.
json_field() {
	printf '%s' "$1" | grep -o "\"$2\": *\"[^\"]*\"" | head -n 1 | sed 's/.*: *"//; s/"$//'
}

# Values of a top-level string array field, one per line.
json_array() {
	printf '%s' "$1" | sed -n "/\"$2\"/,/]/p" | grep -o '"[^"]*"' | sed -n '2,$p' | tr -d '"'
}

rm -rf "$demo_dir"
mkdir -p "$demo_dir"

echo "[0/6] build the genos CLI"
cargo build -p genos-cli

echo "[1/6] create the parent world W0"
create_out="$(genos world create --provider directory --root "$world_root" --format json)"
echo "$create_out"
parent="$(json_field "$create_out" world_id)"

echo "[2/6] seed hello.txt = hello, then snapshot W0"
genos world write-file --provider directory --root "$world_root" \
	--world-id "$parent" --path hello.txt --contents hello --format json
snapshot_out="$(genos world snapshot --provider directory --root "$world_root" \
	--world-id "$parent" --format json)"
echo "$snapshot_out"
snapshot="$(json_field "$snapshot_out" snapshot_id)"

echo "[3/6] fork the snapshot into two worlds A and B"
fork_out="$(genos world fork --provider directory --root "$world_root" \
	--snapshot-id "$snapshot" --count 2 --format json)"
echo "$fork_out"
world_a="$(json_array "$fork_out" world_ids | sed -n '1p')"
world_b="$(json_array "$fork_out" world_ids | sed -n '2p')"

echo "[4/6] A writes bonjour, B writes hola"
genos world write-file --provider directory --root "$world_root" \
	--world-id "$world_a" --path hello.txt --contents bonjour --format json
genos world write-file --provider directory --root "$world_root" \
	--world-id "$world_b" --path hello.txt --contents hola --format json

echo "[5/6] assert A=bonjour, B=hola, W0=hello"
genos world check-file --provider directory --root "$world_root" \
	--path hello.txt \
	--parent "$parent" --expect-parent hello \
	--branch "$world_a" --expect bonjour \
	--branch "$world_b" --expect hola \
	--expect-isolated \
	--format json

echo "[6/6] assert the snapshot never absorbed either write"
# A world forked from S0 *after* both writes must still materialize the original
# contents, so the divergence stayed in the child worlds.
late_out="$(genos world fork --provider directory --root "$world_root" \
	--snapshot-id "$snapshot" --count 1 --format json)"
echo "$late_out"
late_world="$(json_array "$late_out" world_ids | sed -n '1p')"
genos world check-file --provider directory --root "$world_root" \
	--path hello.txt \
	--parent "$late_world" --expect-parent hello \
	--branch "$world_a" --expect bonjour \
	--branch "$world_b" --expect hola \
	--expect-isolated \
	--format json
genos world diff --provider directory --root "$world_root" \
	--world-a "$world_a" --world-b "$world_b" --format json
genos world diff --provider directory --root "$world_root" \
	--world-a "$parent" --world-b "$world_a" --format json

echo
echo "Demo OK: W0(hello) -> A(bonjour) | B(hola)"
echo "world_root=$world_root"
echo "parent_w0=$parent"
echo "snapshot_s0=$snapshot"
echo "world_a=$world_a"
echo "world_b=$world_b"
