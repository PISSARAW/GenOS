import tempfile
import unittest
from pathlib import Path
from lean_trace import search_trace, verify_lean_file


class FakeProver:
    def search(self, **kwargs):
        server, goal, verbose = kwargs["server"], kwargs["goal"], kwargs["verbose"]
        assert server == "stub" and goal and verbose is False
        return "closed", ["intro h", "exact h"]


class ProofTests(unittest.TestCase):
    def test_search_result_is_not_verified(self):
        result = search_trace(FakeProver(), "stub", "p -> p")
        self.assertEqual(result["tactics"], ["intro h", "exact h"])
        self.assertFalse(result["verified"])

    def test_missing_lean_binary_never_certifies(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder, "Test.lean")
            source.write_text("theorem test : True := by trivial")
            with self.assertRaises(FileNotFoundError):
                verify_lean_file(Path(folder, "missing-lean"), source)


if __name__ == "__main__":
    unittest.main()

