#!/usr/bin/env python3
"""Merge a verified scoped rerun into a full result set with provenance."""

import argparse
import hashlib
import json
import os
from pathlib import Path


def read_jsonl(path):
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def result_key(row):
    return row["scenario_id"], row["repetition"]


def merge_rows(base_rows, replacement_rows, scope):
    replacement = {result_key(row): row for row in replacement_rows}
    if len(replacement) != len(replacement_rows):
        raise ValueError("replacement contains duplicate scenario/repetition keys")
    scoped_base = {result_key(row) for row in base_rows if row["experiment_id"] in scope}
    if scoped_base != set(replacement):
        raise ValueError("replacement keys do not exactly cover the declared scope")
    return [replacement.get(result_key(row), row) for row in base_rows]


def write_atomic(path, rows):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path)
    parser.add_argument("refresh", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    base_manifest_path = args.base.with_suffix(".manifest.json")
    refresh_manifest_path = args.refresh.with_suffix(".manifest.json")
    base_manifest = json.loads(base_manifest_path.read_text(encoding="utf-8"))
    refresh_manifest = json.loads(refresh_manifest_path.read_text(encoding="utf-8"))
    scope = set(refresh_manifest["scope"])
    if base_manifest["condition_id"] != refresh_manifest["condition_id"]:
        raise ValueError("condition IDs differ")
    if refresh_manifest["runs"] != len(read_jsonl(args.refresh)):
        raise ValueError("refresh manifest run count does not match result file")
    base_results_sha256 = sha256(args.base)
    merged = merge_rows(read_jsonl(args.base), read_jsonl(args.refresh), scope)
    write_atomic(args.output, merged)
    provenance = {
        "protocol": base_manifest["protocol"],
        "condition_id": base_manifest["condition_id"],
        "status": "merged_scoped_refresh",
        "scenarios": len({row["scenario_id"] for row in merged}),
        "repetitions": base_manifest["repetitions"],
        "runs": len(merged),
        "scope": sorted({row["experiment_id"] for row in merged}),
        "repository_revision": refresh_manifest["repository_revision"],
        "dataset_manifest_sha256": refresh_manifest["dataset_manifest_sha256"],
        "result_file": args.output.name,
        "provenance": {
            "base_manifest": base_manifest,
            "base_results_sha256": base_results_sha256,
            "refreshed_scopes": {
                "experiments": sorted(scope),
                "manifest": refresh_manifest,
                "results_sha256": sha256(args.refresh),
            },
        },
    }
    args.output.with_suffix(".manifest.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Merged {len(merged)} rows; refreshed {len(scope)} experiments: {', '.join(sorted(scope))}")


if __name__ == "__main__":
    main()
