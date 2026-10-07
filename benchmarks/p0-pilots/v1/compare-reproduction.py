"""Compare deux campagnes complètes sans augmenter le nombre de tâches."""
import hashlib
import json
import sys
from pathlib import Path


def read(directory, name):
    return json.loads((directory / name).read_text(encoding="utf-8"))


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def campaign(directory):
    manifest = read(directory, "run-manifest.json")
    result = read(directory, "summary.json")
    if manifest["split"] != "holdout" or not result["pilotComparativeEligible"] or result["oracleLeaks"]:
        raise ValueError("Unqualified reserved campaign")
    rows = read(directory, "scored.json")
    return {"directory": str(directory), "manifest": manifest, "summary": result,
            "rows": {(row["pilot"], row["caseId"], row["arm"]): row for row in rows}}


def validate_controls(primary, replica):
    first, second = primary["manifest"], replica["manifest"]
    if not first["frozenHash"] or first["frozenHash"] != second["frozenHash"]:
        raise ValueError("Different or missing frozen protocol")
    if first["operator"] == second["operator"] or first["processId"] == second["processId"]:
        raise ValueError("Missing separate operator and process")
    if first["seed"] == second["seed"]:
        raise ValueError("Replica must use the second preregistered seed")
    for key in ["sources", "dependencies", "model", "lean", "host"]:
        if fingerprint(first["before"][key]) != fingerprint(second["before"][key]):
            raise ValueError("Replica environment mismatch: " + key)
    if primary["rows"].keys() != replica["rows"].keys():
        raise ValueError("Different paired cohort")


def differences(primary, replica):
    result = []
    for key, first in primary["rows"].items():
        second = replica["rows"][key]
        result.append({"pilot": key[0], "caseId": key[1], "arm": key[2],
                       "primaryCorrect": first["correct"], "replicaCorrect": second["correct"],
                       "sameCandidate": first["selected"] == second["selected"],
                       "sameOutcome": first["correct"] == second["correct"]})
    return result


def main():
    primary, replica = [campaign(Path(name)) for name in sys.argv[1:3]]
    validate_controls(primary, replica)
    pairs = differences(primary, replica)
    result = {"frozenHash": primary["manifest"]["frozenHash"],
              "operators": [run["manifest"]["operator"] for run in [primary, replica]],
              "processIds": [run["manifest"]["processId"] for run in [primary, replica]],
              "campaigns": [run["directory"] for run in [primary, replica]],
              "pairedRows": len(pairs), "sameCandidates": sum(pair["sameCandidate"] for pair in pairs),
              "sameOutcomes": sum(pair["sameOutcome"] for pair in pairs), "pairs": pairs,
              "scope": "Separate operators and processes on the same pinned host and local model. Operator independence additionally requires the retained orchestration or delegation receipt. Replicas are not pooled as additional independent tasks."}
    Path(sys.argv[3]).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({key: result[key] for key in ["operators", "pairedRows", "sameCandidates", "sameOutcomes"]}))


if __name__ == "__main__":
    main()
