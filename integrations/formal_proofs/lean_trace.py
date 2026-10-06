"""Record LeanDojo-v2 proof search and defer acceptance to Lean itself."""
import hashlib
import subprocess
from pathlib import Path


def search_trace(prover, server, goal):
    if not isinstance(goal, str) or not 1 <= len(goal) <= 4000:
        raise ValueError("invalid Lean goal")
    result, tactics = prover.search(server=server, goal=goal, verbose=False)
    if not isinstance(tactics, (list, tuple)) or len(tactics) > 1000:
        raise ValueError("invalid tactic trace")
    return {"goal_hash": hashlib.sha256(goal.encode()).hexdigest(),
            "tactics": [str(tactic)[:400] for tactic in tactics],
            "search_result": str(result)[:200], "verified": False}


def verify_lean_file(lean_binary, source):
    path = Path(source).resolve(strict=True)
    if path.suffix != ".lean" or path.stat().st_size > 1_000_000:
        raise ValueError("small Lean source required")
    run = subprocess.run([str(lean_binary), str(path)], capture_output=True,
                         text=True, timeout=60, check=False)
    return {"verified": run.returncode == 0, "exit_code": run.returncode}
