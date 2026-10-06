"""Compare DGM and GVX archives only under identical evaluation contracts."""
from collections import defaultdict

PROTECTED = ("evaluator/", "permissions/", "promotion/", "gates/")
RESULT_KEYS = {"task", "budget", "evaluator_sha256", "passed"}


def validate_candidate(candidate):
    if not isinstance(candidate, dict) or not {"lineage", "changed_paths", "results"} <= candidate.keys():
        raise ValueError("candidate lineage and results required")
    if not candidate["lineage"] or not isinstance(candidate["changed_paths"], list):
        raise ValueError("invalid lineage")
    paths = [path.replace("\\", "/") for path in candidate["changed_paths"]]
    if any(path.startswith("/") or ".." in path.split("/") for path in paths):
        raise ValueError("unsafe candidate path")
    if any(path.startswith(PROTECTED) for path in paths):
        raise ValueError("candidate modified protected evaluation or authority path")
    return candidate


def result_contract(result):
    if not isinstance(result, dict) or set(result) != RESULT_KEYS:
        raise ValueError("invalid result contract")
    if type(result["passed"]) is not bool or result["budget"] <= 0:
        raise ValueError("invalid result")
    return result["task"], result["budget"], result["evaluator_sha256"]


def archive_results(candidates):
    if not candidates:
        raise ValueError("empty archive")
    rows = []
    for candidate in candidates:
        results = validate_candidate(candidate)["results"]
        if not isinstance(results, list) or not results:
            raise ValueError("held-out task results required")
        rows.extend(results)
    contracts = [result_contract(row) for row in rows]
    return rows, contracts


def compare(archives):
    if not isinstance(archives, dict) or set(archives) != {"dgm", "gvx"}:
        raise ValueError("DGM and GVX archives required")
    scored = {}
    for family, candidates in archives.items():
        scored[family] = archive_results(candidates)
    if set(scored["dgm"][1]) != set(scored["gvx"][1]):
        raise ValueError("tasks, budgets and evaluator must match")
    if len(scored["dgm"][0]) != len(scored["gvx"][0]):
        raise ValueError("unequal evaluation budgets")
    return {family: {"attempts": len(rows), "pass_rate": sum(row["passed"] for row in rows) / len(rows)}
            for family, (rows, _) in scored.items()}
