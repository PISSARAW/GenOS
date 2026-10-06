import unittest
from comparator import compare


def candidate(lineage, passed, paths=None):
    return {"lineage": lineage, "changed_paths": paths or ["worker/heuristic.py"],
            "results": [{"task": "heldout-1", "budget": 100, "evaluator_sha256": "a" * 64,
                         "passed": passed}]}


class ComparatorTests(unittest.TestCase):
    def test_equal_contract_and_lineages(self):
        result = compare({"dgm": [candidate("dgm/root/child", True)],
                          "gvx": [candidate("gvx/root/child", False)]})
        self.assertEqual(result["dgm"]["pass_rate"], 1)
        self.assertEqual(result["gvx"]["pass_rate"], 0)

    def test_evaluator_mutation_rejected(self):
        with self.assertRaises(ValueError):
            compare({"dgm": [candidate("x", True, ["evaluator/score.py"])],
                     "gvx": [candidate("y", True)]})

    def test_budget_mismatch_rejected(self):
        gvx = candidate("y", True)
        gvx["results"][0]["budget"] = 200
        with self.assertRaises(ValueError):
            compare({"dgm": [candidate("x", True)], "gvx": [gvx]})


if __name__ == "__main__":
    unittest.main()
