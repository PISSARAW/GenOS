"""Independent Python reference for E12 business-operation semantics."""
import hashlib
import json
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
    operation = row["input"]["intent"]
    return {"scenario_id": row["scenario_id"], "valid": execute(operation, [operation["reference"]]),
            "unauthorized": execute(operation, []),
            "malformed": execute({**operation, "kind": "CALLX"}, [operation["reference"]]),
            "mission_execution": mission_transfer(row["input"]["mission_workload"])}


def main():
    inputs = [json.loads(line) for line in (ROOT / "dataset/public/inputs/E12.jsonl").read_text(encoding="utf-8").splitlines()]
    outputs = [run_case(row) for row in inputs]
    path = ROOT / "results/E12-python.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(canonical(row) + "\n" for row in outputs), encoding="utf-8")
    manifest = {"backend": "standalone_python_reference", "business_backend": True,
                "cases": len(outputs), "dataset_manifest_sha256": hashlib.sha256((ROOT / "dataset/manifest.json").read_bytes()).hexdigest(),
                "output_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    path.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Python reference: {len(outputs)} cases -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
