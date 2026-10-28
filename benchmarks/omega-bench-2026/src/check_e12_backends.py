"""Compare E12 business-backend outputs against the independent oracle."""
import json
import hashlib
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKENDS = ("python", "node", "rust")
RESULTS = Path(os.environ.get("OMEGA_RESULTS_DIR", ROOT / "results")).resolve()


def validate_results_root():
    if not RESULTS.is_relative_to((ROOT / "results").resolve()):
        raise SystemExit("E12 results directory must stay under public results/.")


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def verify_trace_backend(backend, rows, inputs):
    result_path = RESULTS / f"E12-{backend}.jsonl"
    manifest_path = RESULTS / f"E12-{backend}.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    trace_name = manifest.get("trace_file", "")
    if Path(trace_name).name != trace_name:
        raise SystemExit(f"E12 trace path escapes results/: {backend}")
    trace_path = RESULTS / trace_name
    trace_bytes = trace_path.read_bytes()
    traces = read_jsonl(trace_path)
    digest = hashlib.sha256(trace_bytes).hexdigest()
    if digest != manifest.get("trace_sha256") or len(traces) != len(rows) \
            or manifest.get("trace_records") != len(rows) or manifest.get("cases") != len(rows):
        raise SystemExit(f"E12 trace manifest mismatch: {backend}")
    for row, trace, source in zip(rows, traces, inputs, strict=True):
        expected_input = hashlib.sha256(canonical(source["input"]).encode("utf-8")).hexdigest()
        expected_result = hashlib.sha256(canonical(row).encode("utf-8")).hexdigest()
        if trace.get("scenario_id") != row.get("scenario_id") \
                or trace.get("input_sha256") != expected_input \
                or trace.get("result_sha256") != expected_result \
                or trace.get("status") != "completed" or not trace.get("events"):
            raise SystemExit(f"E12 per-run trace binding mismatch: {backend}/{row.get('scenario_id')}")
    print(f"{backend}: {len(traces)} per-run traces bound to inputs and results")


def main():
    validate_results_root()
    expected = read_jsonl(ROOT / "dataset/oracle/E12.jsonl")
    expected_by_id = {row["scenario_id"]: row["expected"] for row in expected}
    inputs = read_jsonl(ROOT / "dataset/public/inputs/E12.jsonl")
    for backend in BACKENDS:
        rows = read_jsonl(RESULTS / f"E12-{backend}.jsonl")
        mismatches = []
        for row in rows:
            wanted = expected_by_id.get(row["scenario_id"])
            actual = {key: row[key] for key in (
                "valid", "unauthorized", "malformed", "mission_execution")}
            if actual != wanted:
                mismatches.append(row["scenario_id"])
        print(f"{backend}: {len(rows)} cases; {len(mismatches)} mismatches")
        if mismatches:
            raise SystemExit(f"E12 backend mismatch: {backend}: {mismatches[:5]}")
        verify_trace_backend(backend, rows, inputs)
    print("E12 backend parity and unauthorized/malformed zero-side-effect checks passed.")


if __name__ == "__main__":
    main()
