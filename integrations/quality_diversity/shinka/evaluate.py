"""Shinka evaluator: parse literal parameters, never execute candidate code."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from policy import candidate_scores, load_records, parse_parameters


def main(program_path, results_dir):
    destination = Path(results_dir)
    destination.mkdir(parents=True, exist_ok=True)
    try:
        weights = parse_parameters(program_path)
        records = load_records(ROOT / "fixtures" / "train.json")
        scores = candidate_scores(records, weights)
        selected = max(scores, key=scores.get)
        metrics = {"combined_score": scores[selected], "selected_candidate": selected}
        correctness = {"correct": True, "error": None}
    except (ValueError, SyntaxError, TypeError) as error:
        metrics = {"combined_score": 0.0}
        correctness = {"correct": False, "error": str(error)}
    (destination / "metrics.json").write_text(json.dumps(metrics), encoding="utf-8")
    (destination / "correct.json").write_text(json.dumps(correctness), encoding="utf-8")
    return correctness["correct"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--program_path", required=True)
    parser.add_argument("--results_dir", required=True)
    args = parser.parse_args()
    main(args.program_path, args.results_dir)