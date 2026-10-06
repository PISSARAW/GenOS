import sqlite3
import unittest
from reconciliation import dispatch_once, reconcile, state


class TemporalLedgerTests(unittest.TestCase):
    def test_effect_runs_once_and_replays_are_read_only(self):
        connection = sqlite3.connect(":memory:")
        calls = []
        self.assertEqual(dispatch_once(connection, "op-1", calls.append), "confirmed")
        self.assertEqual(dispatch_once(connection, "op-1", calls.append), "confirmed")
        self.assertEqual(calls, ["op-1"])

    def test_uncertain_effect_requires_reconciliation(self):
        connection = sqlite3.connect(":memory:")
        calls = []
        def failed(operation_id):
            calls.append(operation_id)
            raise RuntimeError("lost acknowledgement")
        self.assertEqual(dispatch_once(connection, "op-2", failed), "reconciliation_required")
        self.assertEqual(dispatch_once(connection, "op-2", calls.append), "reconciliation_required")
        self.assertEqual(calls, ["op-2"])
        self.assertEqual(reconcile(connection, "op-2", True), "confirmed")
        self.assertEqual(state(connection, "op-2"), "confirmed")

    def test_interrupted_before_receipt_does_not_repeat(self):
        connection = sqlite3.connect(":memory:")
        connection.execute("CREATE TABLE operations (id TEXT PRIMARY KEY, state TEXT NOT NULL)")
        connection.execute("INSERT INTO operations VALUES ('op-3', 'in_flight')")
        self.assertEqual(dispatch_once(connection, "op-3", lambda _: self.fail("replayed")),
                         "reconciliation_required")


if __name__ == "__main__":
    unittest.main()
