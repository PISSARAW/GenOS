"""Fail-closed preflight for the confirmatory OMEGA-BENCH campaign."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONDITIONS = {
    "A": "json_reference.cjs",
    "B": "gcir_minimal.cjs",
    "C": "gcir_optimized.cjs",
    "D": "genos_full.cjs",
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def count_rows(path):
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def check(blockers, name, outcome):
    condition, detail = outcome
    condition = bool(condition)
    if not condition:
        blockers.append({"check": name, "detail": detail})
    return {"check": name, "passed": condition, "detail": detail}


def dataset_checks(protocol, blockers):
    inputs = ROOT / "dataset" / "public" / "inputs"
    proposed = protocol.get("source_proposed_sample_counts", {})
    checks = []
    for experiment, required in proposed.items():
        if experiment == "note":
            continue
        observed = count_rows(inputs / f"{experiment}.jsonl")
        checks.append(check(blockers, f"sample_count_{experiment}",
                            (observed >= required, f"observed={observed}; proposed_minimum={required}")))
    observed_experiments = {path.stem for path in inputs.glob("E*.jsonl")}
    proposed_experiments = {key for key in proposed if key != "note"}
    checks.append(check(blockers, "sample_count_coverage",
                        (observed_experiments == proposed_experiments,
                         f"observed={len(observed_experiments)}; proposed={len(proposed_experiments)}")))
    holdout = protocol.get("dataset", {}).get("sealed_holdout") is True
    checks.append(check(blockers, "sealed_holdout",
                        (holdout, "protocol.dataset.sealed_holdout must be true")))
    return checks


def design_checks(protocol, blockers):
    design = protocol.get("minimum_design", {})
    inputs = ROOT / "dataset" / "public" / "inputs"
    scenarios = sum(count_rows(path) for path in inputs.glob("E*.jsonl"))
    conditions = len(protocol.get("conditions", []))
    repetitions = design.get("repetitions", 0)
    expected = scenarios * conditions * repetitions
    planned = design.get("planned_executions")
    return [check(blockers, "planned_execution_count",
                  (planned == expected, f"planned={planned}; derived={expected}"))]


def manifest_checks(blockers):
    dataset_root = ROOT / "dataset"
    manifest = read_json(dataset_root / "manifest.json")
    inputs = dataset_root / "public" / "inputs"
    observed_counts = {path.stem: count_rows(path) for path in inputs.glob("E*.jsonl")}
    expected_counts = manifest.get("cases_by_experiment", {})
    checks = [check(blockers, "dataset_manifest_counts",
                    (expected_counts == observed_counts
                     and manifest.get("total_cases") == sum(observed_counts.values()),
                     f"manifest_total={manifest.get('total_cases')}; observed_total={sum(observed_counts.values())}"))]
    hashes = manifest.get("sha256", {})
    mismatches = []
    for split, folder in (("inputs", dataset_root / "public" / "inputs"),
                          ("oracle", dataset_root / "oracle")):
        for path in folder.glob("E*.jsonl"):
            relative = f"{split}/{path.name}"
            content = path.read_bytes().replace(b"\r\n", b"\n")
            digest = hashlib.sha256(content).hexdigest()
            if hashes.get(relative) != digest:
                mismatches.append(relative)
    checks.append(check(blockers, "dataset_manifest_hashes",
                        (not mismatches and len(hashes) == len(observed_counts) * 2,
                         f"verified={len(hashes) - len(mismatches)}/{len(observed_counts) * 2}; mismatches={mismatches}")))
    return checks


def adapter_checks(blockers):
    checks = []
    adapter_root = ROOT / "adapters"
    for condition, filename in CONDITIONS.items():
        exists = (adapter_root / filename).is_file()
        checks.append(check(blockers, f"adapter_{condition}",
                            (exists, f"{filename}: {'present' if exists else 'missing'}")))
    return checks


def configuration_checks(blockers):
    baseline = read_json(ROOT / "configs" / "baselines.json")
    hardware = read_json(ROOT / "configs" / "hardware.example.json")
    model = read_json(ROOT / "configs" / "models.example.json")
    checks = [
        check(blockers, "external_baselines", (baseline.get("status") == "configured" and all(
            item.get("adapter") and item.get("version") for item in baseline.get("families", [])),
            "baseline adapters and versions must be configured")),
        check(blockers, "hardware_lock", (hardware.get("status") == "locked" and hardware.get("cpu_model")
              and hardware.get("memory_bytes"), "hardware configuration must be observed and locked")),
        check(blockers, "model_lock", (model.get("status") == "locked" and model.get("model_id")
              and model.get("model_revision"), "model identity and revision must be locked")),
    ]
    return checks


def preregistration_checks(protocol, blockers):
    requirements = protocol.get("preregistration_required", [])
    checks = [check(blockers, "protocol_preregistered",
                    (protocol.get("status") == "preregistered", "protocol.status must be preregistered"))]
    checks.append(check(blockers, "preregistration_requirements",
                        (not requirements, f"unresolved_items={len(requirements)}")))
    return checks


def main():
    protocol = read_json(ROOT / "protocol.json")
    blockers = []
    checks = []
    checks.extend(dataset_checks(protocol, blockers))
    checks.extend(design_checks(protocol, blockers))
    checks.extend(manifest_checks(blockers))
    checks.extend(adapter_checks(blockers))
    checks.extend(configuration_checks(blockers))
    checks.extend(preregistration_checks(protocol, blockers))
    report = {"protocol": "OMEGA-BENCH-2026",
              "status": "ready" if not blockers else "blocked",
              "checks_passed": sum(item["passed"] for item in checks),
              "checks_total": len(checks), "blockers": blockers, "checks": checks}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not blockers else 2


if __name__ == "__main__":
    raise SystemExit(main())
