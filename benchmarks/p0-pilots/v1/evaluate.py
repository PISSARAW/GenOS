"""Adjudication aveugle des artefacts, après collecte; aucun oracle pour le modèle."""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "evaluation"))
from oracle import score
from paired_statistics import summary
from budgets import validate_rows


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def load_assets(root):
    lock = json.loads((root / "dataset.lock.json").read_text(encoding="utf-8"))
    for name, expected in lock["assets"].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Frozen dataset integrity failure")
    tasks = {}
    for pilot in ["code", "memory", "reasoning"]:
        tasks[pilot] = {task["id"]: task for task in json.loads((root / "public" / (pilot + ".json")).read_text(encoding="utf-8"))}
    return tasks, json.loads((root / "evaluation/oracles.json").read_text(encoding="utf-8"))


def adjudicate(row, context):
    blind = {"opaqueId": digest({"caseId": row["caseId"], "candidate": row["selected"]}),
             "pilot": row["pilot"], "task": context["task"], "candidate": row["selected"]}
    result = score(blind, context)
    result["opaqueId"] = blind["opaqueId"]
    result["oracleLeak"] = any(context["oracle"].get("canary", "_UNDEFINED_PRIVATE_CANARY_") in attempt.get("text", "")
                              for attempt in row["attempts"])
    result["promptOracleLeak"] = any(context["oracle"].get("canary", "_UNDEFINED_PRIVATE_CANARY_") in attempt["prompt"]
                                    for attempt in row["attempts"])
    index = row["chosen"]
    result["unverifiedSelection"] = row["pilot"] != "memory" and index >= 0 and not row["attempts"][index]["check"]["passed"]
    return {**row, **result}, blind, result


def validate_cohort(rows, tasks, manifest):
    expected = {(pilot, task["id"], arm) for pilot, policy in manifest["protocol"]["pilots"].items()
                for task in tasks[pilot].values() if task["split"] == manifest["split"] for arm in policy["arms"]}
    observed = [(row["pilot"], row["caseId"], row["arm"]) for row in rows]
    if set(observed) != expected or len(observed) != len(expected):
        raise ValueError("Incomplete or duplicate paired cohort")
    for row in rows:
        if row["callCount"] != manifest["protocol"]["pilots"][row["pilot"]]["callsPerCase"]:
            raise ValueError("Unexpected call allocation")


def main():
    root = Path(__file__).parent
    output = Path(sys.argv[1])
    manifest = json.loads((output / "run-manifest.json").read_text(encoding="utf-8"))
    collection = json.loads((output / "collection.json").read_text(encoding="utf-8"))
    tasks, oracles = load_assets(root)
    rows = [json.loads(line) for line in (output / "responses.jsonl").read_text(encoding="utf-8").splitlines()]
    validate_cohort(rows, tasks, manifest)
    validate_rows(rows, manifest["protocol"])
    scored, blinded, receipts = [], [], []
    for row in rows:
        task = tasks[row["pilot"]][row["caseId"]]
        context = {"root": root, "task": task, "oracle": oracles[row["pilot"]][row["caseId"]],
                   "node": manifest["before"]["host"]["executable"],
                   "lean": manifest["before"]["lean"]["executable"]}
        evaluated, blind, receipt = adjudicate(row, context)
        scored.append(evaluated)
        blinded.append(blind)
        receipts.append(receipt)
    result = {"protocol": manifest["protocol"]["id"], "split": manifest["split"], "operator": manifest["operator"],
              "frozenHash": manifest["frozenHash"], "pilotComparativeEligible": not collection["drift"] and not collection["dependencyDrift"],
              "confirmatoryEligible": False, "pilots": summary(scored, manifest["protocol"]),
              "oracleLeaks": sum(row["oracleLeak"] or row["promptOracleLeak"] for row in scored),
              "collection": collection, "limitation": "Eight authored tasks per pilot and one local model. No representative capability gain; task bootstrap is descriptive and may degenerate at a ceiling. No pooling replicas as extra tasks. Nine exploratory contrasts per campaign are not confirmatory hypothesis tests."}
    for name, data in [("blinded-candidates.json", blinded), ("independent-oracle-receipts.json", receipts),
                       ("scored.json", scored), ("summary.json", result)]:
        (output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"eligible": result["pilotComparativeEligible"], "leaks": result["oracleLeaks"],
                      "scores": {pilot: {arm: row["correct"] for arm, row in data["arms"].items()}
                                 for pilot, data in result["pilots"].items()}}))
    if result["oracleLeaks"] or not result["pilotComparativeEligible"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
