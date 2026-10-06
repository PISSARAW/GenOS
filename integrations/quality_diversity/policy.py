"""Bounded scoring of observed mission outcomes for topology experiments."""

import ast
import json
import math
from pathlib import Path

WEIGHT_KEYS = {"success_weight", "latency_weight", "token_weight"}
REQUIRED_FIELDS = {
    "mission_id", "candidate_id", "workers", "verification_share",
    "context_fraction", "success", "receipt", "tokens", "budget_tokens",
    "latency_ms", "deadline_ms",
}


def parse_parameters(path):
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
        raise ValueError("Only one PARAMETERS assignment is allowed")
    assignment = tree.body[0]
    if len(assignment.targets) != 1 or not isinstance(assignment.targets[0], ast.Name):
        raise ValueError("Candidate target must be PARAMETERS")
    if assignment.targets[0].id != "PARAMETERS":
        raise ValueError("Candidate target must be PARAMETERS")
    values = ast.literal_eval(assignment.value)
    return validate_parameters(values)


def validate_parameters(values):
    if not isinstance(values, dict) or set(values) != WEIGHT_KEYS:
        raise ValueError("Three scoring weights are required")
    if not all(isinstance(value, (int, float)) and math.isfinite(value)
               and 0 <= value <= 1 for value in values.values()):
        raise ValueError("Weights must be finite values in [0, 1]")
    if not math.isclose(sum(values.values()), 1, abs_tol=1e-9):
        raise ValueError("Weights must sum to one")
    return values


def valid_record(row):
    if not isinstance(row, dict) or not REQUIRED_FIELDS.issubset(row):
        return False
    if not isinstance(row["mission_id"], str) or not isinstance(row["candidate_id"], str):
        return False
    if not isinstance(row["success"], bool) or not isinstance(row["receipt"], str):
        return False
    if not 1 <= row["workers"] <= 4:
        return False
    if not 0 <= row["verification_share"] <= 1 or not 0 < row["context_fraction"] <= 1:
        return False
    return (0 <= row["tokens"] <= row["budget_tokens"]
            and row["budget_tokens"] > 0
            and 0 <= row["latency_ms"] <= row["deadline_ms"]
            and row["deadline_ms"] > 0)


def load_records(path):
    records = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(records, list) or not records or not all(map(valid_record, records)):
        raise ValueError("Invalid mission outcome table")
    pairs = [(row["mission_id"], row["candidate_id"]) for row in records]
    if len(pairs) != len(set(pairs)):
        raise ValueError("Duplicate mission and candidate pair")
    return records


def row_score(row, weights):
    verified = float(row["success"] and bool(row["receipt"]))
    return (weights["success_weight"] * verified
            - weights["latency_weight"] * row["latency_ms"] / row["deadline_ms"]
            - weights["token_weight"] * row["tokens"] / row["budget_tokens"])


def candidate_scores(records, weights):
    mission_ids = {row["mission_id"] for row in records}
    candidates = {row["candidate_id"] for row in records}
    scores = {}
    for candidate in candidates:
        rows = [row for row in records if row["candidate_id"] == candidate]
        if {row["mission_id"] for row in rows} != mission_ids:
            raise ValueError("Each candidate must cover the same missions")
        scores[candidate] = sum(row_score(row, weights) for row in rows) / len(rows)
    return scores