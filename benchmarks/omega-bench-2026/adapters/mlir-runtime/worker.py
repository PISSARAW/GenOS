"""Sequential OMEGA MLIR verifier worker; one JSONL request per tool run."""

import hashlib
import json
import subprocess
import sys
import time


def execute_request(request, command):
    source = request.get("source")
    if not isinstance(source, str) or not isinstance(request.get("id"), int):
        raise ValueError("request_requires_integer_id_and_source")
    started = time.perf_counter_ns()
    result = subprocess.run([*command, "--verify-each", "--canonicalize"],
                            input=source.encode("utf-8"), capture_output=True, check=False)
    latency_ms = (time.perf_counter_ns() - started) / 1_000_000
    return {"id": request["id"], "ok": result.returncode == 0,
            "latency_ms": latency_ms, "output_bytes": len(result.stdout),
            "optimized_ir_sha256": hashlib.sha256(result.stdout).hexdigest(),
            "error": result.stderr.decode("utf-8", errors="replace")[-4000:]}


def main():
    command = ["mlir-opt-22"]
    for line in sys.stdin:
        try:
            response = execute_request(json.loads(line), command)
        except Exception as error:  # Keep the worker alive to return a bounded failure.
            response = {"ok": False, "error": f"{type(error).__name__}: {error}"}
        sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
