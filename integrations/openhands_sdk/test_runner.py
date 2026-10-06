import os
import tempfile
import unittest
from pathlib import Path
from runner import run_task, validate_request


class OpenHandsTests(unittest.TestCase):
    def test_workspace_confinement_and_request(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            Path(root, "candidate").mkdir()
            os.environ["GENOS_OPENHANDS_SANDBOX_ROOT"] = root
            request = {"task": "Inspect the test failure", "model": "test-model"}
            self.assertEqual(validate_request(request, Path(root, "candidate")), Path(root, "candidate"))
            with self.assertRaises(ValueError):
                validate_request(request, outside)
            with self.assertRaises(ValueError):
                validate_request({"task": "missing model"}, Path(root, "candidate"))
            with self.assertRaises(ValueError):
                run_task(request, Path(root, "candidate"), timeout=0)


if __name__ == "__main__":
    unittest.main()
