"""Fail-closed preflight for the confirmatory OMEGA-BENCH campaign."""
import hashlib
import json
from pathlib import Path
from readiness_trace_inventory import auxiliary_trace_status

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
RESULT_FILES = {
    "A": "A-reference.jsonl",
    "B": "B-gcir-minimal.jsonl",
    "C": "C-gcir-optimized.jsonl",
    "D": "D-genos-full.jsonl",
}
MANIFEST_SOURCES = {
    "C": {"e04_optimizer_sha256": "adapters/e04-optimizer.cjs"},
    "TEMPORAL": {
        "workflow_sha256": "adapters/temporal-runtime/workflows.js",
        "activity_sha256": "adapters/temporal-runtime/activities.js",
    },
    "OPA": {"policy_sha256": "adapters/opa.rego"},
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def count_rows(path):
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def file_sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def confined_path(root, relative):
    if not isinstance(relative, str) or not relative.strip():
        return None
    root = root.resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def result_artifact_path(manifest, fallback_name):
    result_root = ROOT / "results"
    filename = manifest.get("result_file") or fallback_name
    return confined_path(result_root, filename)


def source_paths(manifest, adapter_path):
    sources = {"adapter_sha256": adapter_path,
               "dataset_manifest_sha256": ROOT / "dataset" / "manifest.json"}
    declared = MANIFEST_SOURCES.get(manifest.get("condition_id"), {})
    for digest, relative in declared.items():
        sources[digest] = confined_path(ROOT, relative)
    return sources


def source_hashes_match(manifest, sources):
    return all(path is not None and path.is_file()
               and manifest.get(digest) == file_sha256(path)
               for digest, path in sources.items())


def result_rows_match(manifest, result_path):
    if result_path is None or not result_path.is_file():
        return False
    if manifest.get("result_file") and Path(manifest["result_file"]).name != result_path.name:
        return False
    try:
        rows = result_path.read_text(encoding="utf-8").splitlines()
        expected = manifest_run_count(manifest)
        return expected is not None and len(rows) == expected and all(row.strip() for row in rows)
    except OSError:
        return False


def manifest_run_count(manifest):
    for key in ("runs", "cases"):
        value = manifest.get(key)
        if isinstance(value, int) and value > 0:
            return value
    results = manifest.get("results")
    return len(results) if isinstance(results, list) and results else None


def trace_sidecar_matches(manifest, trace_path):
    expected = manifest.get("runs")
    if trace_path is None or not trace_path.is_file() \
            or manifest.get("trace_records") != expected:
        return False
    try:
        content = trace_path.read_bytes()
        rows = content.decode("utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return False
    return manifest.get("trace_sha256") == hashlib.sha256(content).hexdigest() \
        and len(rows) == expected and all(row.strip() for row in rows)


def trace_artifact_path(manifest):
    return confined_path(ROOT / "results", manifest.get("trace_file"))


def manifest_matches_plan(manifest, plan):
    keys = ("condition_id", "scenarios", "repetitions", "runs")
    return all(manifest.get(key) == plan.get(key) for key in keys)


def condition_evidence_matches(manifest, plan, paths):
    return manifest_matches_plan(manifest, plan) \
        and source_hashes_match(manifest, paths["sources"]) \
        and result_rows_match(manifest, paths["result"]) \
        and trace_sidecar_matches(manifest, paths["trace"])


def qualification_matches_manifest(qualification, manifest, adapter_path):
    same_provenance = all(qualification.get(key) == manifest.get(key)
                          for key in ("repository_revision", "adapter_sha256",
                                      "dataset_manifest_sha256", "result_file"))
    adapter_matches = manifest.get("adapter_sha256") == file_sha256(adapter_path)
    dataset_path = ROOT / "dataset" / "manifest.json"
    dataset_matches = manifest.get("dataset_manifest_sha256") == file_sha256(dataset_path)
    return same_provenance and adapter_matches and dataset_matches


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


def manifest_checks(protocol, blockers):
    dataset_root = ROOT / "dataset"
    manifest = read_json(dataset_root / "manifest.json")
    mission_manifest = read_json(dataset_root / "missions" / "manifest.json")
    declared_dataset = protocol.get("dataset", {})
    protocol_hash = hashlib.sha256((dataset_root / "manifest.json").read_bytes()
                                   .replace(b"\r\n", b"\n")).hexdigest()
    protocol_matches = declared_dataset.get("dataset_version") == manifest.get("dataset_version") \
        and declared_dataset.get("dataset_manifest_sha256") == protocol_hash \
        and declared_dataset.get("mission_catalog_version") == mission_manifest.get("catalog_version")
    checks = [check(blockers, "protocol_dataset_freeze",
                    (protocol_matches, f"version={manifest.get('dataset_version')}; protocol_hash_match="
                     f"{declared_dataset.get('dataset_manifest_sha256') == protocol_hash}; "
                     f"mission_catalog={mission_manifest.get('catalog_version')}"))]
    inputs = dataset_root / "public" / "inputs"
    observed_counts = {path.stem: count_rows(path) for path in inputs.glob("E*.jsonl")}
    expected_counts = manifest.get("cases_by_experiment", {})
    checks.append(check(blockers, "dataset_manifest_counts",
                        (expected_counts == observed_counts
                         and manifest.get("total_cases") == sum(observed_counts.values()),
                         f"manifest_total={manifest.get('total_cases')}; observed_total={sum(observed_counts.values())}")))
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
        adapter_path = adapter_root / filename
        exists = adapter_path.is_file()
        manifest_path = ROOT / "results" / RESULT_MANIFESTS[condition]
        manifest = read_json(manifest_path) if manifest_path.is_file() else {}
        result_path = result_artifact_path(manifest, RESULT_FILES[condition])
        plan = main_condition_plan(condition)
        paths = {"sources": source_paths(manifest, adapter_path), "result": result_path,
                 "trace": trace_artifact_path(manifest)}
        evidence_ready = condition_evidence_matches(manifest, plan, paths)
        if condition == "D":
            qualification_path = ROOT / "results" / "D-qualification.json"
            qualification = read_json(qualification_path) if qualification_path.is_file() else {}
            expected_runs = sum(protocol_counts().values()) * read_json(ROOT / "protocol.json")["minimum_design"]["repetitions"]
            qualified = qualification.get("status") == "qualified" \
                and qualification.get("runs") == expected_runs \
                and qualification.get("critical_failures") == 0 \
                and qualification_matches_manifest(qualification, manifest, adapter_root / filename)
            ready = exists and evidence_ready and qualified
            detail = f"{filename}: {'present' if exists else 'missing'}; run evidence={'current and complete' if evidence_ready else 'missing, incomplete or stale'}; qualification={'passed and provenance-matched' if qualified else 'missing, incomplete or stale'}"
            checks.append(check(blockers, f"adapter_{condition}", (ready, detail)))
            continue
        checks.append(check(blockers, f"adapter_{condition}",
                            (exists and evidence_ready,
                             f"{filename}: {'present' if exists else 'missing'}; run evidence={'current and complete' if evidence_ready else 'missing, incomplete or stale'}")))
    return checks


def protocol_counts():
    return read_json(ROOT / "protocol.json").get("dataset", {}).get("scenarios_by_experiment", {})


def main_condition_plan(condition):
    protocol = read_json(ROOT / "protocol.json")
    scenarios = sum(protocol_counts().values())
    repetitions = protocol.get("minimum_design", {}).get("repetitions", 0)
    return {"condition_id": condition, "scenarios": scenarios,
            "repetitions": repetitions, "runs": scenarios * repetitions}


def configuration_checks(protocol, blockers):
    baseline = read_json(ROOT / "configs" / "baselines.json")
    hardware_path = ROOT / "configs" / "hardware.local.json"
    if not hardware_path.is_file():
        hardware_path = ROOT / "configs" / "hardware.example.json"
    hardware = read_json(hardware_path)
    model = read_json(ROOT / "configs" / "models.example.json")
    checks = [
        check(blockers, "external_baselines", baseline_status(baseline, protocol)),
        check(blockers, "auxiliary_trace_artifacts", auxiliary_trace_status(ROOT, protocol)),
        check(blockers, "hardware_lock", (hardware.get("status") == "locked" and hardware.get("cpu_model")
              and hardware.get("memory_bytes"), "hardware configuration must be observed and locked")),
        check(blockers, "confirmatory_hardware", confirmatory_hardware_status(hardware)),
        check(blockers, "model_lock", model_control_status(protocol, model)),
    ]
    return checks


def confirmatory_hardware_status(hardware):
    controls = hardware.get("confirmatory_controls", {})
    required = ("host_dedicated", "cpu_isolated", "memory_isolated", "serialized_runs")
    missing = [key for key in required if controls.get(key) is not True]
    passed = not missing
    detail = "verified dedicated host, isolated resources and serialized runs" \
        if passed else f"unverified confirmatory controls={missing}"
    return passed, detail


def baseline_status(baseline, protocol):
    expected = {f"E{number:02d}" for number in range(1, 13)}
    families = baseline.get("families", [])
    pending = []
    for family in families:
        applicable = set(family.get("applicable_experiments", []))
        not_applicable = set(family.get("not_applicable_experiments", []))
        if applicable & not_applicable or applicable | not_applicable != expected:
            pending.append(f"{family.get('id')}: applicability map incomplete")
            continue
        if not baseline_family_ready(family, protocol):
            pending.append(family.get("id", "unknown"))
    passed = len(families) == 7 and not pending
    return passed, f"ready={len(families) - len(pending)}/7; pending={pending}"


def baseline_family_ready(family, protocol):
    if family.get("status") != "qualified_public_development" \
            or not family.get("adapter") or not family.get("version"):
        return False
    manifest_path = confined_path(ROOT, family.get("results_manifest"))
    evaluation_path = confined_path(ROOT, family.get("evaluation_file"))
    adapter_path = confined_path(ROOT, family.get("adapter"))
    if any(path is None or not path.is_file()
           for path in (manifest_path, evaluation_path, adapter_path)):
        return False
    try:
        manifest = read_json(manifest_path)
        evaluation = read_json(evaluation_path)
    except (OSError, ValueError):
        return False
    result_name = evaluation_path.name.replace(".evaluation.json", ".jsonl")
    result_path = result_artifact_path(manifest, result_name)
    paths = {"sources": source_paths(manifest, adapter_path), "result": result_path,
             "trace": trace_artifact_path(manifest)}
    return baseline_evidence_matches(family, protocol, (manifest, evaluation, paths))


def baseline_evidence_matches(family, protocol, evidence):
    manifest, evaluation, paths = evidence
    experiments = set(family.get("applicable_experiments", []))
    counts = protocol.get("dataset", {}).get("scenarios_by_experiment", {})
    repetitions = protocol.get("minimum_design", {}).get("repetitions", 0)
    expected_runs = sum(counts.get(name, 0) for name in experiments) * repetitions
    plan = {"condition_id": family.get("result_condition"),
            "scenarios": sum(counts.get(name, 0) for name in experiments),
            "repetitions": repetitions, "runs": expected_runs}
    summary = evaluation.get("summary", {})
    observed_runs = sum(item.get("runs", 0) for item in summary.values())
    completeness = all(item.get("missing_runs", 1) == 0
                       and item.get("duplicate_repetitions", 1) == 0
                       and item.get("invalid_status", 1) == 0
                       for item in summary.values())
    return condition_evidence_matches(manifest, plan, paths) \
        and evaluation.get("condition_id") == family.get("result_condition") \
        and set(summary) == experiments and observed_runs == expected_runs \
        and completeness and not evaluation.get("unexpected_scenario_ids")


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
    checks.extend(manifest_checks(protocol, blockers))
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
