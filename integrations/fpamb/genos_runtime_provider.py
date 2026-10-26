"""FP-AMB adapter backed by GenOS VectorMemoryService and modelRouter."""

import atexit
import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path

from fp_amb import BaseMemoryProvider


class GenOSRuntimeProvider(BaseMemoryProvider):
    """Store turns and answer queries through the actual GenOS backend services."""

    def __init__(self):
        self.root = Path(__file__).resolve().parents[2]
        run_dir = os.environ.get("GENOS_FPAMB_RUN_DIR")
        self.run_dir = Path(run_dir) if run_dir else Path(tempfile.mkdtemp(prefix="genos-fpamb-run-"))
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.run_dir / "genos-fpamb.sqlite"
        self.port = int(os.environ["GENOS_FPAMB_BRIDGE_PORT"])
        self.stderr_log = (self.run_dir / "genos-runtime.stderr.log").open("a", encoding="utf-8")
        child_env = os.environ.copy()
        child_env.update({
            "GENOS_DB_PATH": str(self.db_path),
            "GENOS_FPAMB_DB_PATH": str(self.db_path),
            "GENOS_FPAMB_BRIDGE_PORT": str(self.port),
            "GENOS_DISABLE_DOTENV": "1",
            "GENOS_DB_BACKUP_SKIP": "1",
            "GENOS_MEMORY_REQUIRE_SEMANTIC": "true",
            "GENOS_ADMIN_PASSWORD": secrets.token_urlsafe(32),
        })
        bridge = self.root / "integrations" / "fpamb" / "genos-runtime-bridge.cjs"
        self.process = subprocess.Popen(
            ["node", str(bridge)], cwd=self.root, env=child_env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.stderr_log,
            text=True, encoding="utf-8", bufsize=1
        )
        ready = self._read_response()
        if not ready.get("ready"):
            self.close()
            raise RuntimeError(f"GenOS FP-AMB bridge did not start: {ready}")
        atexit.register(self.close)

    def _read_response(self):
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("GenOS FP-AMB bridge exited without a response.")
        return json.loads(line)

    def _request(self, payload):
        if self.process.poll() is not None:
            raise RuntimeError("GenOS FP-AMB bridge exited unexpectedly.")
        self.process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.process.stdin.flush()
        response = self._read_response()
        if not response.get("ok"):
            raise RuntimeError(response.get("error", "GenOS bridge request failed."))
        return response.get("result")

    def ingest_turn(self, **turn):
        self._request({"op": "ingest", "turn": turn})

    def retrieve_context(self, query, top_k=5):
        result = self._request({"op": "retrieve", "query": query, "top_k": top_k})
        return result.get("context", "")

    def close(self):
        if getattr(self, "process", None) is None or self.process.poll() is not None:
            return
        try:
            self.process.stdin.write('{"op":"shutdown"}\n')
            self.process.stdin.flush()
            response = self._read_response()
            if response.get("ok") and isinstance(response.get("result"), dict):
                stats_path = self.run_dir / "genos-memory-runtime-stats.json"
                stats_path.write_text(json.dumps(response["result"], indent=2), encoding="utf-8")
            self.process.stdin.close()
            self.process.wait(timeout=10)
        except (BrokenPipeError, OSError, RuntimeError, subprocess.TimeoutExpired):
            self.process.terminate()
        finally:
            if self.stderr_log and not self.stderr_log.closed:
                self.stderr_log.close()
