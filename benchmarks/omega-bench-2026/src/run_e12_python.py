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


def run_case(row):
    operation = row["input"]["intent"]
    return {"scenario_id": row["scenario_id"], "valid": execute(operation, [operation["reference"]]),
            "unauthorized": execute(operation, []),
            "malformed": execute({**operation, "kind": "CALLX"}, [operation["reference"]])}


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
