import json
import tempfile
import unittest
from pathlib import Path

from scaffold_lineage import ScaffoldLineageArchive


DIGEST_A = "a" * 64
DIGEST_B = "b" * 64


def root_record():
    return {
        "candidate_id": "root", "scaffold_sha256": DIGEST_A,
        "snapshot_id": "snapshot-root", "created_at": "2026-10-19T00:00:00Z",
    }


def child_record():
    return {
        "candidate_id": "child", "parent_id": "root", "author_id": "mutator-a",
        "patch_sha256": DIGEST_A, "scaffold_sha256": DIGEST_B,
        "capsule_id": "capsule-child", "snapshot_id": "snapshot-child",
        "changed_paths": ["worker/search.py"], "created_at": "2026-10-19T00:01:00Z",
    }


class ScaffoldLineageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.path = Path(self.temporary.name) / "lineage.jsonl"
        self.archive = ScaffoldLineageArchive(self.path)
        self.archive.register_root(root_record())

    def tearDown(self):
        self.temporary.cleanup()

    def test_isolated_candidate_and_failure_are_retained(self):
        self.archive.register_candidate(child_record())
        self.archive.record_failure({
            "candidate_id": "child", "phase": "holdout", "error_code": "REGRESSION",
            "evidence_refs": ["artifact://holdout/child"],
            "observed_at": "2026-10-19T00:02:00Z",
        })

        reopened = ScaffoldLineageArchive(self.path)

        self.assertEqual(reopened.candidate_lineage("child"), ["root", "child"])
        self.assertEqual(reopened.events[-1]["event_type"], "CANDIDATE_FAILED")
        self.assertIsNone(reopened.events[0]["previous_hash"])

    def test_protected_authority_change_is_rejected(self):
        record = child_record()
        record["changed_paths"] = ["evaluator/score.py"]

        with self.assertRaisesRegex(ValueError, "protected authority"):
            self.archive.register_candidate(record)

    def test_capsule_reuse_is_rejected(self):
        self.archive.register_candidate(child_record())
        sibling = child_record()
        sibling["candidate_id"] = "sibling"

        with self.assertRaisesRegex(ValueError, "capsule must be isolated"):
            self.archive.register_candidate(sibling)

    def test_tampered_archive_fails_closed(self):
        self.archive.register_candidate(child_record())
        rows = self.path.read_text(encoding="utf-8").splitlines()
        tampered = json.loads(rows[-1])
        tampered["payload"]["author_id"] = "rewritten"
        rows[-1] = json.dumps(tampered)
        self.path.write_text("\n".join(rows) + "\n", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "event hash mismatch"):
            ScaffoldLineageArchive(self.path)


if __name__ == "__main__":
    unittest.main()
