"""Regression probes for the bounded quality-diversity lab."""

import json
import tempfile
import unittest
from pathlib import Path

from archive import compare
from policy import candidate_scores, load_records, parse_parameters
from shinka.evaluate import main as evaluate

ROOT = Path(__file__).resolve().parent
TRAIN = ROOT / "fixtures" / "train.json"
HOLDOUT = ROOT / "fixtures" / "holdout.json"
PROGRAM = ROOT / "shinka" / "initial.py"


class QualityDiversityTests(unittest.TestCase):
    def test_archive_and_holdout_are_separate(self):
        report = compare(TRAIN, HOLDOUT, PROGRAM)
        self.assertEqual(len(report["archive"]), 3)
        self.assertEqual(report["selected"], "duo")
        self.assertLess(report["holdout_score"], report["train_score"])
        self.assertFalse(report["promotion"])

    def test_candidate_source_is_never_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory) / "candidate.py"
            marker = Path(directory) / "executed"
            candidate.write_text(
                "PARAMETERS = __import__('pathlib').Path(" + repr(str(marker))
                + ").write_text('bad')", encoding="utf-8")
            with self.assertRaises(ValueError):
                parse_parameters(candidate)
            self.assertFalse(marker.exists())

    def test_incomplete_measurement_matrix_fails(self):
        rows = load_records(TRAIN)
        with self.assertRaises(ValueError):
            candidate_scores(rows[:-1], parse_parameters(PROGRAM))

    def test_shinka_result_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(evaluate(PROGRAM, directory))
            metrics = json.loads((Path(directory) / "metrics.json").read_text())
            correct = json.loads((Path(directory) / "correct.json").read_text())
            self.assertTrue(correct["correct"])
            self.assertEqual(metrics["selected_candidate"], "duo")
            self.assertNotIn("holdout_score", metrics)


if __name__ == "__main__":
    unittest.main()