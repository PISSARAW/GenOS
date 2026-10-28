"""Independent Python reference for E12 business-operation semantics."""
import hashlib
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def execute(operation, allowed):
    effects = 0
    if operation.get("kind") != "CALL":
        return {"status": "blocked", "reason_class": "invalid_operation", "side_effects": effects}
    if operation.get("reference") not in allowed:
        return {"status": "blocked", "reason_class": "unauthorized", "side_effects": effects}
    effects += 1
    return {"status": "emitted", "value": operation["arguments"], "side_effects": effects}


def transfer_operation(operation, backend):
    if backend in ("json", "portable"):
        return json.loads(json.dumps(operation, ensure_ascii=False))
    if backend == "tabular":
        row = [operation["kind"], operation["reference"],
               operation["arguments"]["record_id"], operation["arguments"]["limit"]]
        return {"id": operation["id"], "kind": row[0], "reference": row[1],
                "arguments": {"record_id": row[2], "limit": row[3]}}
    raise ValueError(f"unknown_transfer_backend:{backend}")


def mission_transfer(workload):
    operation = workload["operation"]
    backends = workload["backends"]
    first_results = []
    violations = []
    transfer_count = 0
    processed_agents = 0
    for agent_index in range(workload["agents"]):
        agent_ok = True
        for backend in backends:
            result = transfer_operation(operation, backend)
            transfer_count += 1
            agent_ok = agent_ok and canonical(result) == canonical(operation)
            if agent_index == 0:
                first_results.append(result)
        processed_agents += int(agent_ok)
        if not agent_ok and "portable_semantics_lost" not in violations:
            violations.append("portable_semantics_lost")
    equivalent = processed_agents == workload["agents"] and not violations
    return {"agent_count": workload["agents"], "processed_agents": processed_agents,
            "transfer_count": transfer_count, "backend_results": first_results,
            "equivalent": equivalent, "violations": violations}


def run_case(row):
    started = time.perf_counter_ns()
    events = []

    def record(name):
        events.append({"name": name, "at_unix_ms": time.time_ns() // 1_000_000,
                       "elapsed_ms": (time.perf_counter_ns() - started) / 1_000_000})

    record("run_started")
    operation = row["input"]["intent"]
    valid = execute(operation, [operation["reference"]])
    record("valid_operation_observed")
    unauthorized = execute(operation, [])
    record("unauthorized_operation_observed")
    malformed = execute({**operation, "kind": "CALLX"}, [operation["reference"]])
    record("malformed_operation_observed")
    mission = mission_transfer(row["input"]["mission_workload"])
    record("mission_transfer_observed")
    output = {"scenario_id": row["scenario_id"], "valid": valid,
              "unauthorized": unauthorized, "malformed": malformed,
              "mission_execution": mission}
    record("run_completed")
    trace = {"schema": "omega-bench-e12-trace/v1", "backend": "standalone_python_reference",
             "scenario_id": row["scenario_id"],
             "started_at_unix_ms": events[0]["at_unix_ms"],
             "ended_at_unix_ms": events[-1]["at_unix_ms"],
             "duration_ms": events[-1]["elapsed_ms"],
             "input_sha256": hashlib.sha256(canonical(row["input"]).encode("utf-8")).hexdigest(),
             "result_sha256": hashlib.sha256(canonical(output).encode("utf-8")).hexdigest(),
             "status": "completed", "events": events}
    return output, trace


def public_path(base, filename):
    results_root = (ROOT / "results").resolve()
    candidate = (Path(base) / filename).resolve()
    try:
        candidate.relative_to(results_root)
    except ValueError as error:
        raise ValueError("E12 output path must stay under public results/") from error
    return candidate


def main():
    input_root = Path(os.environ.get("OMEGA_DATASET_INPUTS", ROOT / "dataset/public/inputs"))
    inputs = [json.loads(line) for line in (input_root / "E12.jsonl").read_text(encoding="utf-8").splitlines()]
    runs = [run_case(row) for row in inputs]
    outputs = [run[0] for run in runs]
    traces = [run[1] for run in runs]
    path = public_path(os.environ.get("OMEGA_RESULTS_DIR", ROOT / "results"), "E12-python.jsonl")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(canonical(row) + "\n" for row in outputs), encoding="utf-8")
    trace_path = path.with_name(path.stem + ".traces.jsonl")
    trace_body = "".join(canonical(row) + "\n" for row in traces)
    trace_path.write_text(trace_body, encoding="utf-8")
    manifest = {"backend": "standalone_python_reference", "business_backend": True,
                "cases": len(outputs), "dataset_manifest_sha256": hashlib.sha256((ROOT / "dataset/manifest.json").read_bytes()).hexdigest(),
                "output_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "trace_file": trace_path.name, "trace_records": len(traces),
                "trace_sha256": hashlib.sha256(trace_path.read_bytes()).hexdigest()}
    path.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Python reference: {len(outputs)} cases -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
