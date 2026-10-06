import tempfile
import unittest
from pathlib import Path
from wasmtime import wat2wasm
from score_runner import run_score


class WasmtimeTests(unittest.TestCase):
    def module(self, folder, wat):
        path = Path(folder, "score.wasm")
        path.write_bytes(wat2wasm(wat))
        return path

    def test_score_and_fuel(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.module(folder, '(module (func (export "score") (param i32) (result i32) local.get 0 i32.const 2 i32.mul))')
            self.assertEqual(run_score(path, 21)["result"], 42)
            self.assertGreater(run_score(path, 21)["fuel_used"], 0)

    def test_imports_and_infinite_loop_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            imported = self.module(folder, '(module (import "env" "secret" (func)) (func (export "score") (param i32) (result i32) local.get 0))')
            with self.assertRaises(ValueError):
                run_score(imported, 1)
            looping = self.module(folder, '(module (func (export "score") (param i32) (result i32) (loop br 0) i32.const 0))')
            with self.assertRaises(Exception):
                run_score(looping, 1, fuel=100)


if __name__ == "__main__":
    unittest.main()
