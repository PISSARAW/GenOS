import unittest
import os
import json
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python.genos_sdk.cost_accounting import CostAccounting
from python.genos_sdk.conditional_merge import ConditionalMerge
from python.genos_sdk.audit_bundle import AuditBundle

class TestGenOSSDK(unittest.TestCase):

    def test_cost_accounting(self):
        ca = CostAccounting(budget_limit=50.0)
        self.assertEqual(ca.get_remaining_budget(), 50.0)
        
        ca.add_cost(10.0, "API Call")
        self.assertEqual(ca.get_remaining_budget(), 40.0)
        
        with self.assertRaises(RuntimeError):
            ca.add_cost(45.0, "Expensive API Call")
            
        with self.assertRaises(ValueError):
            ca.add_cost(-5.0, "Invalid cost")
            
        report = ca.generate_report()
        self.assertEqual(report["current_cost"], 10.0)
        self.assertEqual(len(report["transactions"]), 1)

    def test_conditional_merge(self):
        cm = ConditionalMerge(confidence_threshold=0.8)
        
        res_pass = cm.evaluate_merge("feature-a", "main", 0.9)
        self.assertEqual(res_pass["status"], "merged")
        
        res_fail = cm.evaluate_merge("feature-b", "main", 0.5)
        self.assertEqual(res_fail["status"], "rejected")
        
        cm.update_threshold(0.5)
        res_pass_2 = cm.evaluate_merge("feature-b", "main", 0.6)
        self.assertEqual(res_pass_2["status"], "merged")
        
        with self.assertRaises(ValueError):
            cm.update_threshold(1.5)

    def test_audit_bundle(self):
        ab = AuditBundle(run_id="run-123", environment="prod")
        ab.add_event("start", "Initialization started")
        ab.add_event("action", "Created node")
        
        sealed = ab.seal_bundle()
        self.assertIn("data", sealed)
        self.assertIn("signature", sealed)
        self.assertEqual(len(sealed["data"]["events"]), 2)
        
        filepath = "test_bundle.json"
        ab.export(filepath)
        self.assertTrue(os.path.exists(filepath))
        
        with open(filepath, 'r') as f:
            data = json.load(f)
            self.assertEqual(data["data"]["run_id"], "run-123")
            
        os.remove(filepath)

if __name__ == "__main__":
    unittest.main()
