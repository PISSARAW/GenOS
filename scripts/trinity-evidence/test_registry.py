"""Synthetic fixtures test registry integrity, not Trinity mission success."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from adapters import is_zero
from registry import build_registry, encoded, output_root, verify_output, write_registry
from mission_criteria import merged_criteria
from sources import Catalog, GROUPS, digest, resolve
from validation import locators


SECRET = "PRIVATE_PROMPT_REPORT_LOG_SENTINEL_DO_NOT_COPY"
COUNTS = {"cases": 4, "attempts": 4, "worlds": 3, "historicalPass": 2,
          "heterogeneousRefusals": 1, "promotions": 0}


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value))


def synthetic_case(identifier):
    variant = identifier.split("-", 1)[0]
    return {"caseId": identifier, "variant": variant, "level": "simple",
            "originalMission": "Vérifie l’entrée; justifie. Puis vérifie l’ensemble !\n"}


def group_cases():
    controlled = synthetic_case("controlled-simple")
    controlled.update({"addedContract": SECRET, "attempts": [{"attemptId": "a1",
      "request": {"mission": SECRET}, "chronology": {"transportExit": None},
      "worlds": [{"worldNumber": 1, "agentId": "w1", "assignment": {},
        "firstBlockage": None, "cascades": [], "check": {"independentCheck": {"exitCode": 0},
        "controlIntegrity": True}, "answerReview": {"substantiveAnswer": SECRET,
        "issues": [SECRET]}, "commands": [{"stdout": SECRET}], "receipts": []}]}]})
    heterogeneous = synthetic_case("heterogeneous-simple")
    heterogeneous.update({"addedContract": SECRET, "attempts": [{"attemptId": "a2",
      "firstAttemptBlockage": {"text": "minimum diversity below threshold"},
      "chronology": {"transportExit": 1}, "worlds": []}]})
    temporal = synthetic_case("temporal-simple")
    temporal.update({"scopeReview": {"fixture": SECRET}, "attempts": [{"attemptId": "a3",
      "reason": "supervisor_timeout", "transportExitCode": 1, "workers": [{
        "worldNumber": 1, "workerId": "w3", "roleActual": "basic_implementation",
        "runtime": {"primaryCause": "TOOL_MISSING"}, "answer": {
          "previousIndependentPass": False, "evidence": ["E404"], "quality": SECRET}}]}]})
    jury = synthetic_case("jury-simple")
    jury["id"] = jury.pop("caseId")
    jury.update({"analysis": {"review": [SECRET]}, "attempts": [{"id": "a4",
      "dispatch": {"exitCode": 0}, "requestMission": SECRET, "worlds": [{
        "worldNumber": 1, "agentId": "w4", "identity": {}, "replay": {"exitCode": 0},
        "qualitativeReview": {"promotion": False, "observedFinalReport": SECRET},
        "causalAssessment": {"firstObservedFailure": None, "observedCascade": []}}]}]})
    return [[controlled, heterogeneous], [temporal], [jury]]


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.config = {"auditRoot": root / "sealed", "missions": root / "missions.json",
                       "output": root / "output", "expected": COUNTS}
        groups = group_cases()
        missions = [{"id": case.get("caseId", case.get("id")), "variant": case["variant"],
          "level": case["level"], "mission": case["originalMission"]}
          for cases in groups for case in cases]
        save(self.config["missions"], {"missions": missions})
        for group, cases in zip(GROUPS, groups):
            ref = {"file": str(self.config["missions"]), "sha256": digest(self.config["missions"])}
            save(self.config["auditRoot"] / group / "audit.json", {"cases": cases, "sources": [ref]})
        self.reseal()

    def reseal(self):
        root = self.config["auditRoot"]
        entries = [{"path": group + "/audit.json", "sha256": digest(root / group / "audit.json"),
                    "bytes": (root / group / "audit.json").stat().st_size} for group in GROUPS]
        save(root / "manifest.json", {"files": entries})
        self.config["manifestSha256"] = digest(root / "manifest.json")

    def change(self, group, callback):
        path = self.config["auditRoot"] / group / "audit.json"
        value = json.loads(path.read_text(encoding="utf-8"))
        callback(value)
        save(path, value)

    def test_counts_and_refusal_without_worlds(self):
        payload = build_registry(self.config)
        self.assertEqual(payload["validation"]["counts"], COUNTS)
        refusal = payload["attempts"][1]
        self.assertTrue(refusal["compositionRefused"])
        self.assertEqual(refusal["workers"], [])
        self.assertEqual(payload["attempts"][0]["transportExit"]["state"], "unknown")

    def test_lossless_clauses_and_pending_original(self):
        payload = build_registry(self.config)
        for mission in payload["missions"]:
            clauses = mission["originalClauses"]
            self.assertEqual("".join(row["text"] for row in clauses), mission["originalText"])
            self.assertTrue(all(row["status"] == "unknown" for row in clauses))
            self.assertTrue(all(row["verifierRef"]["approved"] is False for row in clauses))
            self.assertTrue(all(row["criterion"]["proposalRefs"] for row in clauses))

    def test_primary_is_not_late_timeout(self):
        payload = build_registry(self.config)
        self.assertEqual(payload["workers"][1]["causes"]["primary"]["category"], "native_tool_unavailable")
        self.assertEqual(payload["attempts"][2]["causes"]["finalStop"]["category"], "supervisor_timeout")
        self.assertEqual(payload["workers"][1]["causes"]["cascadeObservation"], "non_observed")

    def test_unresolved_claim_reference_remains_unknown(self):
        unresolved = build_registry(self.config)["unresolvedReferences"]
        self.assertEqual(unresolved[0]["reportedId"], "E404")
        self.assertEqual(unresolved[0]["state"], "unknown")

    def test_private_payload_not_exported(self):
        payload = build_registry(self.config)
        self.assertNotIn(SECRET.encode(), encoded(payload))

    def test_missing_case_is_rejected(self):
        self.change(GROUPS[0], lambda data: data["cases"].pop())
        self.reseal()
        with self.assertRaisesRegex(ValueError, "coverage"):
            build_registry(self.config)

    def test_duplicate_attempt_is_rejected(self):
        self.change(GROUPS[0], lambda data: data["cases"][1]["attempts"][0].update(attemptId="a1"))
        self.reseal()
        with self.assertRaisesRegex(ValueError, "duplicate"):
            build_registry(self.config)

    def test_source_byte_tampering_is_rejected(self):
        self.change(GROUPS[0], lambda data: data.update(tampered=True))
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            build_registry(self.config)

    def test_coordinated_manifest_tampering_is_rejected(self):
        original = self.config["manifestSha256"]
        self.change(GROUPS[0], lambda data: data.update(tampered=True))
        self.reseal()
        self.config["manifestSha256"] = original
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            build_registry(self.config)

    def test_original_mission_tampering_is_rejected(self):
        self.change(GROUPS[0], lambda data: data["cases"][0].update(originalMission="Autre mission"))
        self.reseal()
        with self.assertRaisesRegex(ValueError, "Original mission"):
            build_registry(self.config)

    def test_mission_source_hash_tampering_is_rejected(self):
        save(self.config["missions"], {"missions": []})
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            build_registry(self.config)

    def test_boolean_false_does_not_forge_success(self):
        self.assertFalse(is_zero(False))
        self.change(GROUPS[2], lambda data: data["cases"][0]["attempts"][0]["worlds"][0]
                    ["replay"].update(exitCode=False))
        self.reseal()
        with self.assertRaisesRegex(ValueError, "counts differ"):
            build_registry(self.config)

    def test_deterministic_output_and_reconstruction(self):
        payload = build_registry(self.config)
        index = write_registry(payload, self.config)
        self.assertEqual(verify_output(payload, self.config)["counts"], COUNTS)
        second = build_registry(self.config)
        self.assertEqual(encoded(payload), encoded(second))
        self.assertEqual(index, write_registry(second, self.config))

    def test_forged_proof_and_pass_in_output_rejected(self):
        payload = build_registry(self.config)
        write_registry(payload, self.config)
        forged = copy.deepcopy(payload["workers"])
        forged[0]["disposition"]["promotion"]["value"] = True
        save(self.config["output"] / "workers.json", forged)
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_output(payload, self.config)

    def test_forged_pass_even_with_rewritten_output_index(self):
        payload = build_registry(self.config)
        forged = copy.deepcopy(payload)
        forged["workers"][1]["disposition"]["historicalFixturePass"] = True
        write_registry(forged, self.config)
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_output(payload, self.config)

    def test_forged_locator_hash_and_missing_pointer_rejected(self):
        catalog = Catalog()
        document = catalog.load(self.config["missions"], digest(self.config["missions"]))
        reference = catalog.ref(document, "/missions/0")
        reference["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Forged source"):
            locators({"source": reference}, catalog)
        reference["sha256"] = document.sha256
        reference["pointer"] = "/does-not-exist"
        with self.assertRaises(KeyError):
            locators({"source": reference}, catalog)

    def test_leak_review_pointer_is_retained_without_answer(self):
        self.change(GROUPS[0], lambda data: data["cases"][0].update(
            review="Le contrat donne déjà " + SECRET))
        self.reseal()
        payload = build_registry(self.config)
        leaks = payload["answerLeakObservations"]
        self.assertEqual(leaks[0]["source"]["pointer"], "/cases/0/review")
        self.assertEqual(leaks[0]["state"], "audited_text_leak_suspected_requires_review")
        self.assertNotIn(SECRET.encode(), encoded(leaks))

    def test_output_source_overlap_rejected(self):
        self.config["output"] = self.config["auditRoot"] / "new"
        with self.assertRaisesRegex(ValueError, "overlaps"):
            output_root(self.config)

    def test_json_pointer_escaping(self):
        self.assertEqual(resolve({"a/b": {"~": [7]}}, "/a~1b/~0/0"), 7)

    def test_authored_criteria_full_coverage(self):
        criteria = merged_criteria()
        self.assertEqual(len(criteria), 48)
        self.assertTrue(all(3 <= len(rows) <= 6 for rows in criteria.values()))
        payload = build_registry(self.config)
        for mission in payload["missions"]:
            self.assertTrue(mission["proposedMissionCriteria"])
            self.assertTrue(all(row["status"] == "unknown" and row["proofRefs"] == []
                                for row in mission["proposedMissionCriteria"]))


if __name__ == "__main__":
    unittest.main()
