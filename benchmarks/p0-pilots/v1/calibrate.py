"""Calibre les oracles sur références authored et contre-exemples; aucun appel IA."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "evaluation"))
from oracle import score
from evaluate import load_assets


def main():
    root = Path(__file__).parent
    tasks, oracles = load_assets(root)
    context = {"root": root, "node": sys.argv[2], "lean": sys.argv[3]}
    results = []
    for pilot, cohort in tasks.items():
        for case_id, task in cohort.items():
            oracle = oracles[pilot][case_id]
            candidates = {"code": {"expression": oracle.get("referenceExpression")},
                          "memory": {"answer": oracle.get("expected")},
                          "reasoning": {"proof": oracle.get("referenceProof")}}
            row = score({"pilot": pilot, "task": task, "candidate": candidates[pilot]}, {**context, "oracle": oracle})
            if not row["correct"]:
                raise ValueError(f"Reference oracle failed: {case_id}: {row}")
            results.append({"caseId": case_id, "pilot": pilot, "reference": row})
    negative = [("code", "code-05-median", {"expression": "a===1?3:4"}),
                ("code", "code-04-modulo", {"expression": "process.exit(0)"}),
                ("memory", "memory-05", {"answer": oracles["memory"]["memory-05"]["wrong"]}),
                ("reasoning", "reasoning-04-and_swap", {"proof": "by sorry"})]
    for pilot, case_id, candidate in negative:
        row = score({"pilot": pilot, "task": tasks[pilot][case_id], "candidate": candidate},
                    {**context, "oracle": oracles[pilot][case_id]})
        if row["correct"]:
            raise ValueError("Negative oracle accepted")
        results.append({"caseId": case_id, "pilot": pilot, "negative": row})
    Path(sys.argv[1]).write_text(json.dumps({"modelCalls": 0, "results": results}, indent=2), encoding="utf-8")
    print(f"Independent oracle calibration: {len(results)} checks passed; zero model calls.")


if __name__ == "__main__":
    main()

