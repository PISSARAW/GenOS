"""Score frozen candidate outputs against the assessor-only holdout oracle."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = Path.home() / ".codex" / "benchmark-secrets" / "omega-bench-2026"
HOLDOUT_ROOT = PRIVATE_ROOT / "holdout-v0.4.0"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluate import finalize, load_results, read_jsonl, summarize
from generate_holdout import HOLDOUT_COUNTS, verify_holdout


def holdout_oracle():
    valid, detail = verify_holdout()
    if not valid:
        raise RuntimeError(f"Private holdout verification failed: {detail}")
    expected = {}
    for experiment in sorted(HOLDOUT_COUNTS):
        path = HOLDOUT_ROOT / "oracle" / f"{experiment}.jsonl"
        expected.update({row["scenario_id"]: row for row in read_jsonl(path)})
    return expected


def evaluate(results_path, condition):
    results_path = results_path.resolve()
    if not results_path.is_file():
        raise FileNotFoundError(f"Frozen result file not found: {results_path}")
    results_digest = hashlib.sha256(results_path.read_bytes()).hexdigest()
    expected = holdout_oracle()
    grouped = load_results(results_path, condition, None)
    summary = finalize(summarize(grouped, expected))
    unexpected = sorted(set(grouped) - set(expected))
    return {"protocol": "OMEGA-BENCH-2026", "split": "sealed_assessor_only",
            "condition_id": condition, "results_sha256": results_digest,
            "status": "descriptive_holdout_score_not_significance_test",
            "unexpected_scenario_ids": unexpected, "summary": summary}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--condition", required=True, choices=["A", "B", "C", "D"])
    args = parser.parse_args()
    print(json.dumps(evaluate(args.results, args.condition), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
