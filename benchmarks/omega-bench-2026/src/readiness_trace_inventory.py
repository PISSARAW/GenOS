"""Fail-closed trace inventory for ablations, load runs and E12 backends."""
import hashlib
import json
from pathlib import Path

AUXILIARY_TRACE_MANIFESTS = {
    "A1-off": {"file": "A1-off.manifest.json", "condition_id": "A1-off", "scope": ["E04"]},
    "A1-on": {"file": "A1-on.manifest.json", "condition_id": "A1-on", "scope": ["E04"]},
    "A2-off": {"file": "ABLATION-A2-off.manifest.json", "condition_id": "A2-off", "scope": ["E03"]},
    "A2-on": {"file": "ABLATION-A2-on.manifest.json", "condition_id": "A2-on", "scope": ["E03"]},
    "A3-off": {"file": "A3-off.manifest.json", "condition_id": "A3-off", "scope": ["E03"]},
    "A3-on": {"file": "A3-on.manifest.json", "condition_id": "A3-on", "scope": ["E03"]},
    "A4-control": {"file": "A4-E05-control.manifest.json", "condition_id": "A4_CONTROL", "scope": ["E05"]},
    "A4-native": {"file": "A4-E05-journal-native.manifest.json", "condition_id": "A4_JOURNAL_NATIVE", "scope": ["E05"]},
    "A5": {"file": "ABLATION-A5.manifest.json", "condition_id": "A5", "scope": ["E10"]},
    "A6": {"file": "ABLATION-A6.manifest.json", "condition_id": "A6", "scope": ["E11"]},
    "A7": {"file": "ABLATION-A7.manifest.json", "condition_id": "A7", "scope": ["E02"]},
    "A8": {"file": "ABLATION-A8.manifest.json", "condition_id": "A8", "scope": [
        f"E{number:02d}" for number in range(1, 13)]},
    "E09-load": {"file": "E09-load.json", "kind": "load"},
    "E09-soak": {"file": "E09-soak.json", "kind": "soak"},
    "E12-python": {"file": "E12-python.manifest.json", "kind": "backend",
                   "backend": "standalone_python_reference", "result_file": "E12-python.jsonl"},
    "E12-node": {"file": "E12-node.manifest.json", "kind": "backend",
                 "backend": "node_gcir_runtime", "result_file": "E12-node.jsonl"},
    "E12-rust": {"file": "E12-rust.manifest.json", "kind": "backend",
                 "backend": "production_rust_omega_runtime", "result_file": "E12-rust.jsonl"},
}


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


def manifest_run_count(manifest):
    for key in ("runs", "cases"):
        value = manifest.get(key)
        if isinstance(value, int) and value > 0:
            return value
    results = manifest.get("results")
    return len(results) if isinstance(results, list) and results else None


def trace_sidecar_matches(manifest, trace_path):
    expected = manifest_run_count(manifest)
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


def auxiliary_manifest_matches(manifest, spec, context):
    if spec.get("condition_id") and manifest.get("condition_id") != spec["condition_id"]:
        return False
    if spec.get("backend") and manifest.get("backend") != spec["backend"]:
        return False
    dataset_path = context["dataset_manifest"]
    if not dataset_path.is_file() or manifest.get("dataset_manifest_sha256") \
            != file_sha256(dataset_path):
        return False
    results_root = context["results_root"]
    trace_path = confined_path(results_root, manifest.get("trace_file"))
    if not trace_sidecar_matches(manifest, trace_path):
        return False
    kind = spec.get("kind", "ablation")
    if kind == "ablation":
        return ablation_manifest_matches(manifest, spec, context)
    if kind == "load":
        return load_manifest_matches(manifest, False)
    if kind == "soak":
        return load_manifest_matches(manifest, True)
    return backend_manifest_matches(manifest, spec, context)


def ablation_manifest_matches(manifest, spec, context):
    scope = spec["scope"]
    counts = context["scenario_counts"]
    repetitions = context["repetitions"]
    scenarios = sum(counts.get(name, 0) for name in scope)
    expected_runs = scenarios * repetitions
    result_path = confined_path(context["results_root"], manifest.get("result_file"))
    return manifest.get("scope") == scope and manifest.get("scenarios") == scenarios \
        and manifest.get("repetitions") == repetitions and manifest.get("runs") == expected_runs \
        and result_rows_match(manifest, result_path)


def load_manifest_matches(manifest, soak):
    results = manifest.get("results")
    if not isinstance(results, list) or not results:
        return False
    if soak:
        expected = manifest.get("soak", {}).get("cycles")
    else:
        expected = len(manifest.get("scales", [])) * manifest.get("repetitions", 0)
    return expected == len(results) == manifest_run_count(manifest)


def backend_manifest_matches(manifest, spec, context):
    expected = context["scenario_counts"].get("E12", 0)
    result_path = confined_path(context["results_root"], spec["result_file"])
    return manifest.get("cases") == expected \
        and result_rows_match(manifest, result_path)


def auxiliary_file_ready(manifest_path, spec, context):
    if manifest_path is None or not manifest_path.is_file():
        return False
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return auxiliary_manifest_matches(manifest, spec, context)


def auxiliary_trace_status(root, protocol):
    results_root = root / "results"
    context = {"results_root": results_root,
               "dataset_manifest": root / "dataset" / "manifest.json",
               "scenario_counts": protocol.get("dataset", {}).get("scenarios_by_experiment", {}),
               "repetitions": protocol.get("minimum_design", {}).get("repetitions", 0)}
    missing = []
    for name, spec in AUXILIARY_TRACE_MANIFESTS.items():
        manifest_path = confined_path(results_root, spec["file"])
        if not auxiliary_file_ready(manifest_path, spec, context):
            missing.append(name)
    passed = not missing
    detail = f"ready={len(AUXILIARY_TRACE_MANIFESTS) - len(missing)}/{len(AUXILIARY_TRACE_MANIFESTS)}; missing_or_stale={missing}"
    return passed, detail
