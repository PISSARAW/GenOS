import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1] / "adapters" / "mlir-runtime" / "worker.py"


class MlirWorkerProtocolTests(unittest.TestCase):
    def test_request_returns_per_run_hash_and_monotonic_duration(self):
        with tempfile.TemporaryDirectory() as temporary:
            echo = Path(temporary) / "echo.py"
            echo.write_text("import sys\nsys.stdout.buffer.write(sys.stdin.buffer.read())\n",
                            encoding="utf-8")
            request = {"id": 17, "source": "module {}\n"}
            code = ("import importlib.util,json,sys; "
                    "s=importlib.util.spec_from_file_location('worker',sys.argv[1]); "
                    "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
                    "print(json.dumps(m.execute_request(json.loads(sys.stdin.read()), "
                    "[sys.executable,sys.argv[2]])))")
            result = subprocess.run([sys.executable, "-c", code, str(WORKER), str(echo)],
                                    input=json.dumps(request), capture_output=True,
                                    check=True, text=True)
            response = json.loads(result.stdout)
        self.assertTrue(response["ok"])
        self.assertEqual(response["id"], 17)
        self.assertEqual(response["latency_ms"] >= 0, True)
        self.assertEqual(response["output_bytes"], len(request["source"].encode()))
        self.assertEqual(response["optimized_ir_sha256"],
                         hashlib.sha256(request["source"].encode()).hexdigest())

    def test_failed_tool_is_not_reported_as_verified(self):
        with tempfile.TemporaryDirectory() as temporary:
            fail = Path(temporary) / "fail.py"
            fail.write_text("import sys\nsys.stderr.write('invalid IR')\nsys.exit(2)\n",
                            encoding="utf-8")
            code = ("import importlib.util,json,sys; "
                    "s=importlib.util.spec_from_file_location('worker',sys.argv[1]); "
                    "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
                    "print(json.dumps(m.execute_request(json.loads(sys.stdin.read()), "
                    "[sys.executable,sys.argv[2]])))")
            result = subprocess.run([sys.executable, "-c", code, str(WORKER), str(fail)],
                                    input=json.dumps({"id": 2, "source": "module {}"}),
                                    capture_output=True, check=True, text=True)
        response = json.loads(result.stdout)
        self.assertFalse(response["ok"])
        self.assertIn("invalid IR", response["error"])


if __name__ == "__main__":
    unittest.main()
