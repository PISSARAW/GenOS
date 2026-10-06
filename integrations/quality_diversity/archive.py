"""Pyribs archive over measured GenOS topology candidates."""

import argparse
import json
from pathlib import Path

from ribs.archives import GridArchive

from policy import candidate_scores, load_records, parse_parameters


def build_archive(records, weights):
    scores = candidate_scores(records, weights)
    archive = GridArchive(solution_dim=3, dims=[4, 4],
                          ranges=[(1, 5), (0, 1.000001)])
    for candidate, score in scores.items():
        row = next(item for item in records if item["candidate_id"] == candidate)
        solution = [row["workers"], row["verification_share"], row["context_fraction"]]
        archive.add_single(solution, score, solution[:2])
    data = archive.data(return_type="dict")
    return [
        {"solution": solution.tolist(), "objective": float(objective),
         "measures": measures.tolist()}
        for solution, objective, measures in
        zip(data["solution"], data["objective"], data["measures"])
    ]


def compare(train_path, holdout_path, program_path):
    weights = parse_parameters(program_path)
    train = load_records(train_path)
    holdout = load_records(holdout_path)
    train_scores = candidate_scores(train, weights)
    selected = max(train_scores, key=train_scores.get)
    holdout_scores = candidate_scores(holdout, weights)
    if selected not in holdout_scores:
        raise ValueError("Selected candidate missing from holdout")
    return {
        "archive": build_archive(train, weights),
        "selected": selected,
        "train_score": train_scores[selected],
        "holdout_score": holdout_scores[selected],
        "promotion": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--holdout", type=Path, required=True)
    parser.add_argument("--program", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(compare(args.train, args.holdout, args.program), indent=2))


if __name__ == "__main__":
    main()