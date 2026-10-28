"""Fail-closed artifact provenance checks used by the public readiness gate."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import check_readiness as readiness
import readiness_trace_inventory as trace_inventory


class ReadinessProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dataset = self.root / "manifest.json"
        self.adapter = self.root / "adapter.cjs"
        self.result = self.root / "result.jsonl"
        self.trace = self.root / "result.traces.jsonl"
        self.dataset.write_text('{"dataset_version":"fixture"}\n', encoding="utf-8")
        self.adapter.write_text("module.exports = {};\n", encoding="utf-8")
        self.result.write_text('{"run":1}\n{"run":2}\n', encoding="utf-8")
        self.trace.write_text('{"trace":1}\n{"trace":2}\n', encoding="utf-8")
        self.manifest = {
            "condition_id": "A",
            "scenarios": 2,
            "repetitions": 1,
            "runs": 2,
            "repository_revision": "a" * 40,
            "adapter_sha256": readiness.file_sha256(self.adapter),
            "dataset_manifest_sha256": readiness.file_sha256(self.dataset),
            "result_file": self.result.name,
            "trace_file": self.trace.name,
            "trace_records": 2,
            "trace_sha256": readiness.file_sha256(self.trace),
        }
        self.plan = {key: self.manifest[key] for key in
                     ("condition_id", "scenarios", "repetitions", "runs")}
        self.paths = {
            "sources": {"adapter_sha256": self.adapter,
                        "dataset_manifest_sha256": self.dataset},
            "result": self.result,
            "trace": self.trace,
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_accepts_complete_current_artifacts(self):
        self.assertTrue(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_stale_dataset_manifest_digest(self):
        self.manifest["dataset_manifest_sha256"] = "0" * 64
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_baseline_rejects_stale_public_dataset_digest(self):
        self.manifest["dataset_manifest_sha256"] = "0" * 64
        family = {"result_condition": "A", "applicable_experiments": ["E01"]}
        protocol = {"dataset": {"scenarios_by_experiment": {"E01": 2}},
                    "minimum_design": {"repetitions": 1}}
        evaluation = {"condition_id": "A", "summary": {"E01": {
            "runs": 2, "missing_runs": 0, "duplicate_repetitions": 0,
            "invalid_status": 0}}, "unexpected_scenario_ids": []}
        evidence = (self.manifest, evaluation, self.paths)
        self.assertFalse(readiness.baseline_evidence_matches(
            family, protocol, evidence))

    def test_configured_baseline_is_not_a_completed_run(self):
        family = {"status": "configured", "adapter": "adapters/json_reference.cjs",
                  "version": "fixture"}
        self.assertFalse(readiness.baseline_family_ready(family, {}))

    def test_rejects_stale_adapter_digest(self):
        self.manifest["adapter_sha256"] = "0" * 64
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_wrong_condition_or_run_count(self):
        self.manifest["condition_id"] = "B"
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))
        self.manifest["condition_id"] = "A"
        self.manifest["runs"] = 3
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_missing_or_truncated_result_rows(self):
        self.paths["result"] = self.root / "missing.jsonl"
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))
        self.paths["result"] = self.result
        self.result.write_text('{"run":1}\n', encoding="utf-8")
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_blank_result_rows(self):
        self.result.write_text('{"run":1}\n\n{"run":2}\n', encoding="utf-8")
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_stale_trace_digest(self):
        self.manifest["trace_sha256"] = "0" * 64
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_missing_trace_sidecar(self):
        self.paths["trace"] = self.root / "missing.traces.jsonl"
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_trace_record_or_line_count_mismatch(self):
        self.manifest["trace_records"] = 1
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_auxiliary_ablation_inventory_accepts_matching_trace(self):
        manifest, spec, context = self._auxiliary_ablation_fixture()
        self.assertTrue(trace_inventory.auxiliary_manifest_matches(
            manifest, spec, context))

    def test_auxiliary_inventory_rejects_missing_stale_and_escaped_trace(self):
        manifest, spec, context = self._auxiliary_ablation_fixture()
        manifest["trace_sha256"] = "0" * 64
        self.assertFalse(trace_inventory.auxiliary_manifest_matches(
            manifest, spec, context))
        manifest["trace_sha256"] = readiness.file_sha256(self.trace)
        manifest["trace_file"] = "../outside.traces.jsonl"
        self.assertFalse(trace_inventory.auxiliary_manifest_matches(
            manifest, spec, context))

    def test_auxiliary_inventory_rejects_trace_count_mismatch(self):
        manifest, spec, context = self._auxiliary_ablation_fixture()
        manifest["trace_records"] = 1
        self.assertFalse(trace_inventory.auxiliary_manifest_matches(
            manifest, spec, context))
        manifest["trace_records"] = 2
        self.trace.write_text('{"trace":1}\n', encoding="utf-8")
        manifest["trace_sha256"] = readiness.file_sha256(self.trace)
        self.assertFalse(trace_inventory.auxiliary_manifest_matches(
            manifest, spec, context))

    def test_auxiliary_inventory_uses_e09_cycle_and_e12_case_counts(self):
        context = self._auxiliary_context({"E12": 2})
        load = dict(self.manifest, scales=[10, 20], results=[{}, {}])
        load.pop("runs")
        load_spec = {"kind": "load"}
        self.assertTrue(trace_inventory.auxiliary_manifest_matches(
            load, load_spec, context))
        soak = dict(load, soak={"cycles": 2})
        self.assertTrue(trace_inventory.auxiliary_manifest_matches(
            soak, {"kind": "soak"}, context))
        e12 = dict(self.manifest, cases=2, backend="fixture_backend",
                   result_file="e12.jsonl")
        e12.pop("runs")
        (self.root / "e12.jsonl").write_text('{"run":1}\n{"run":2}\n', encoding="utf-8")
        self.assertTrue(trace_inventory.auxiliary_manifest_matches(
            e12, {"kind": "backend", "backend": "fixture_backend",
                  "result_file": "e12.jsonl"}, context))

    def test_auxiliary_inventory_rejects_swapped_condition_or_backend(self):
        manifest, spec, context = self._auxiliary_ablation_fixture()
        manifest["condition_id"] = "A1-on"
        self.assertFalse(trace_inventory.auxiliary_manifest_matches(
            manifest, spec, context))
        e12 = dict(self.manifest, cases=2, backend="backend_b",
                   result_file="e12.jsonl")
        e12.pop("runs")
        (self.root / "e12.jsonl").write_text('{"run":1}\n{"run":2}\n', encoding="utf-8")
        self.assertFalse(trace_inventory.auxiliary_manifest_matches(
            e12, {"kind": "backend", "backend": "backend_a",
                  "result_file": "e12.jsonl"}, context))

    def test_auxiliary_inventory_rejects_missing_manifest(self):
        context = self._auxiliary_context({"E01": 2})
        self.assertFalse(trace_inventory.auxiliary_file_ready(
            self.root / "missing.manifest.json", {"scope": ["E01"]}, context))
        self.manifest["trace_records"] = 2
        self.trace.write_text('{"trace":1}\n', encoding="utf-8")
        self.manifest["trace_sha256"] = readiness.file_sha256(self.trace)
        self.assertFalse(readiness.condition_evidence_matches(
            self.manifest, self.plan, self.paths))

    def test_rejects_escaping_result_paths(self):
        self.assertIsNone(readiness.confined_path(self.root, "../outside.jsonl"))
        self.assertIsNone(readiness.confined_path(self.root, "../outside.traces.jsonl"))

    def test_confirmatory_hardware_requires_all_isolation_controls(self):
        hardware = {"confirmatory_controls": {
            "host_dedicated": True, "cpu_isolated": True,
            "memory_isolated": True, "serialized_runs": True}}
        self.assertTrue(readiness.confirmatory_hardware_status(hardware)[0])
        hardware["confirmatory_controls"]["host_dedicated"] = False
        passed, detail = readiness.confirmatory_hardware_status(hardware)
        self.assertFalse(passed)
        self.assertIn("host_dedicated", detail)

    def _auxiliary_ablation_fixture(self):
        manifest = dict(self.manifest, condition_id="A1-off", scope=["E01"])
        context = self._auxiliary_context({"E01": 2})
        return manifest, {"condition_id": "A1-off", "scope": ["E01"]}, context

    def _auxiliary_context(self, scenario_counts):
        return {"results_root": self.root, "dataset_manifest": self.dataset,
                "scenario_counts": scenario_counts, "repetitions": 1}


if __name__ == "__main__":
    unittest.main()
