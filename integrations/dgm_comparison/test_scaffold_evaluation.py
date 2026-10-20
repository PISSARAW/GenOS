import copy
import unittest

from scaffold_evaluation import evaluate_campaign


DIGEST = "d" * 64


def row(case_id, side, responsibility_score):
    score = 0.8 if side == "candidate" else 0.5
    return {
        "case_id": case_id, "seed": 7, "agent_score": score,
        "responsibility_score": responsibility_score,
        "contract_sha256": DIGEST, "capsule_id": f"{side}-{case_id}",
        "evidence_refs": [f"artifact://{side}/{case_id}"],
    }


def campaign():
    return {
        "candidate_id": "child", "parent_id": "root", "author_id": "mutator",
        "evaluator_id": "independent-judge", "evaluator_sha256": DIGEST,
        "runner_ids": {"baseline": "runner-baseline", "candidate": "runner-candidate"},
        "cases": {"benchmark": ["train-1"], "holdout": ["secret-1"]},
        "reports": {
            "benchmark": {
                "baseline": [row("train-1", "baseline", 0.4)],
                "candidate": [row("train-1", "candidate", 0.7)],
            },
            "holdout": {
                "baseline": [row("secret-1", "baseline", 0.4)],
                "candidate": [row("secret-1", "candidate", 0.65)],
            },
        },
        "thresholds": {"agent_gain": 0.1, "responsibility_gain": 0.1},
        "provenance_refs": ["lineage://child", "snapshot://child"],
    }


class ScaffoldEvaluationTests(unittest.TestCase):
    def test_double_causal_gain_only_opens_review(self):
        result = evaluate_campaign(campaign())

        self.assertTrue(result["review_eligible"])
        self.assertEqual(result["status"], "AWAITING_PROMOTION_REVIEW")
        self.assertIsNone(result["promotion_decision"])
        self.assertEqual(len(result["evaluation_receipt_sha256"]), 64)
        self.assertTrue(result["phase_results"]["holdout"]["double_causal_gate"])

    def test_agent_gain_without_project_responsibility_is_rejected(self):
        value = campaign()
        value["reports"]["holdout"]["candidate"][0]["responsibility_score"] = 0.3

        result = evaluate_campaign(value)

        self.assertFalse(result["review_eligible"])
        self.assertEqual(result["status"], "EVIDENCE_REJECTED")
        self.assertIsNone(result["promotion_decision"])

    def test_evaluator_cannot_be_the_candidate_author(self):
        value = campaign()
        value["evaluator_id"] = value["author_id"]

        with self.assertRaisesRegex(ValueError, "must be independent"):
            evaluate_campaign(value)

    def test_holdout_must_be_disjoint(self):
        value = campaign()
        value["cases"]["holdout"] = ["train-1"]

        with self.assertRaisesRegex(ValueError, "disjoint"):
            evaluate_campaign(value)

    def test_contract_change_between_pair_is_rejected(self):
        value = campaign()
        value["reports"]["holdout"]["candidate"][0]["contract_sha256"] = "e" * 64

        with self.assertRaisesRegex(ValueError, "contract changed"):
            evaluate_campaign(value)

    def test_candidate_cannot_share_baseline_capsule(self):
        value = copy.deepcopy(campaign())
        shared = value["reports"]["benchmark"]["baseline"][0]["capsule_id"]
        value["reports"]["benchmark"]["candidate"][0]["capsule_id"] = shared

        with self.assertRaisesRegex(ValueError, "capsules must be isolated"):
            evaluate_campaign(value)


if __name__ == "__main__":
    unittest.main()
