import unittest
import pandas as pd
from causal_probe import assess_effect


class CausalProbeTests(unittest.TestCase):
    def test_confounded_synthetic_effect(self):
        rows = []
        for index in range(160):
            traffic = index % 11 + 1
            intervention = int((index * 7) % 13 > 5)
            errors = 15 + 2 * traffic - 3 * intervention + (index % 3 - 1) * 0.1
            rows.append({"traffic": traffic, "intervention": intervention, "errors": errors})
        result = assess_effect(pd.DataFrame(rows))
        self.assertAlmostEqual(result["effect_estimate"], -3, delta=0.5)
        self.assertEqual(result["status"], "exploratory_not_proven")

    def test_missing_confounder_fails(self):
        with self.assertRaises(ValueError):
            assess_effect(pd.DataFrame({"intervention": [0, 1], "errors": [2, 1]}))


if __name__ == "__main__":
    unittest.main()
