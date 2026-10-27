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
RESULT_MANIFESTS = {
    "A": "A-reference.manifest.json",
    "B": "B-gcir-minimal.manifest.json",
    "C": "C-gcir-optimized.manifest.json",
    "D": "D-genos-full.manifest.json",
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
    checks.append(check(blockers, "sealed_holdout", sealed_holdout_status(protocol)))
    return checks


def sealed_holdout_status(protocol):
    if protocol.get("dataset", {}).get("sealed_holdout") is not True:
        return False, "protocol.dataset.sealed_holdout must be true"
    try:
        from generate_holdout import verify_holdout
        return verify_holdout()
    except (OSError, ValueError, RuntimeError) as error:
        return False, f"private holdout verification failed: {error}"


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
        if condition == "D":
            qualification_path = ROOT / "results" / "D-qualification.json"
            qualification = read_json(qualification_path) if qualification_path.is_file() else {}
            expected_runs = sum(protocol_counts().values()) * read_json(ROOT / "protocol.json")["minimum_design"]["repetitions"]
            qualified = qualification.get("status") == "qualified" \
                and qualification.get("runs") == expected_runs \
                and qualification.get("critical_failures") == 0
            detail = f"{filename}: {'present' if exists else 'missing'}; qualification={'passed' if qualified else 'missing or incomplete'}"
            checks.append(check(blockers, f"adapter_{condition}", (exists and qualified, detail)))
            continue
        checks.append(check(blockers, f"adapter_{condition}",
                            (exists, f"{filename}: {'present' if exists else 'missing'}")))
    return checks


def protocol_counts():
    return read_json(ROOT / "protocol.json").get("dataset", {}).get("scenarios_by_experiment", {})


def configuration_checks(protocol, blockers):
    baseline = read_json(ROOT / "configs" / "baselines.json")
    hardware = read_json(ROOT / "configs" / "hardware.example.json")
    model = read_json(ROOT / "configs" / "models.example.json")
    checks = [
        check(blockers, "external_baselines", (baseline.get("status") == "configured" and all(
            item.get("adapter") and item.get("version") for item in baseline.get("families", [])),
            "baseline adapters and versions must be configured")),
        check(blockers, "hardware_lock", (hardware.get("status") == "locked" and hardware.get("cpu_model")
              and hardware.get("memory_bytes"), "hardware configuration must be observed and locked")),
        check(blockers, "model_lock", model_control_status(protocol, model)),
    ]
    return checks


def model_control_status(protocol, model):
    if protocol.get("model_required") is not False:
        configured = model.get("status") == "locked" and model.get("model_id") and model.get("model_revision")
        return configured, "model identity and revision must be locked"
    if model.get("status") != "not_required":
        return False, "model is declared N/A but model configuration is not marked not_required"
    for condition, filename in RESULT_MANIFESTS.items():
        path = ROOT / "results" / filename
        if not path.is_file() or read_json(path).get("external_model_calls") != 0:
            return False, f"condition {condition} lacks evidence of zero external model calls"
    return True, "not required: A-D manifests each record zero external model calls"


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
    checks.extend(configuration_checks(protocol, blockers))
    checks.extend(preregistration_checks(protocol, blockers))
    report = {"protocol": "OMEGA-BENCH-2026",
              "status": "ready" if not blockers else "blocked",
              "checks_passed": sum(item["passed"] for item in checks),
              "checks_total": len(checks), "blockers": blockers, "checks": checks}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not blockers else 2


if __name__ == "__main__":
    raise SystemExit(main())
