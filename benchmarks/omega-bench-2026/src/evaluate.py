"""Score one condition's JSONL results against the independent oracle."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_oracle():
    expected = {}
    for path in sorted((ROOT / "dataset" / "oracle").glob("E*.jsonl")):
        expected.update({row["scenario_id"]: row for row in read_jsonl(path)})
    return expected


def load_results(path, condition, experiment):
    selected = [row for row in read_jsonl(path) if row.get("condition_id") == condition and (not experiment or row.get("experiment_id") == experiment)]
    grouped = defaultdict(list)
    for row in selected:
        grouped[row.get("scenario_id")].append(row)
    return grouped


def scoped_oracle(expected, experiments):
    if not experiments:
        return expected
    selected = set(experiments)
    return {key: row for key, row in expected.items()
            if row["experiment_id"] in selected}


def priority_violation(left, right, allocations):
    equal_demand = left["minimum"] == right["minimum"]
    higher_priority = left["priority"] > right["priority"]
    return equal_demand and higher_priority \
        and allocations[left["agent"]] < allocations[right["agent"]]


def fairness_holds(demands, allocations):
    return not any(priority_violation(left, right, allocations)
                   for left in demands for right in demands)


def correct_e11(answer, contract):
    allocations = answer.get("allocation") if isinstance(answer, dict) else None
    demands = contract.get("demands", [])
    expected_agents = {item["agent"] for item in demands}
    if not isinstance(allocations, dict) or set(allocations) != expected_agents:
        return False
    non_negative_integers = all(isinstance(value, int) and value >= 0 for value in allocations.values())
    conserved = sum(allocations.values()) == contract.get("resource_budget")
    minimums = all(allocations[item["agent"]] >= item["minimum"] for item in demands)
    totals = answer.get("allocated_total") == contract.get("resource_budget") and answer.get("unallocated") == 0
    return non_negative_integers and conserved and minimums and fairness_holds(demands, allocations) and totals


def is_correct(answer, oracle):
    expected = oracle["expected"]
    if "mission_execution" in expected \
            and answer.get("mission_execution") != expected["mission_execution"]:
        return False
    if oracle["experiment_id"] == "E11":
        return correct_e11(answer, expected["allocation_contract"])
    return answer == expected


def summarize(grouped, expected):
    summary = defaultdict(lambda: {"scenarios": 0, "runs": 0, "correct_runs": 0, "missing_runs": 0, "duplicate_repetitions": 0, "invalid_status": 0, "critical_failures": 0, "latency_ms": [], "input_bytes": 0, "output_bytes": 0})
    for scenario_id, oracle in expected.items():
        exp = oracle["experiment_id"]
        bucket = summary[exp]
        bucket["scenarios"] += 1
        rows = grouped.get(scenario_id, [])
        if not rows:
            bucket["missing_runs"] += 3
            continue
        repetitions = defaultdict(list)
        for row in rows:
            repetitions[row.get("repetition")].append(row)
        for repetition in range(1, 4):
            run_rows = repetitions.get(repetition, [])
            if not run_rows:
                bucket["missing_runs"] += 1
                continue
            if len(run_rows) > 1:
                bucket["duplicate_repetitions"] += len(run_rows) - 1
            row = run_rows[0]
            bucket["runs"] += 1
            correct = row.get("status") == "completed" and is_correct(row.get("answer"), oracle)
            bucket["correct_runs"] += int(correct)
            bucket["invalid_status"] += int(row.get("status") != "completed")
            answer = row.get("answer") if isinstance(row.get("answer"), dict) else {}
            critical = bool(row.get("violations"))
            mission = answer.get("mission_execution", {})
            critical |= bool(mission.get("violations"))
            critical |= exp == "E03" and mission.get("decisions") != oracle["expected"].get(
                "mission_execution", {}).get("decisions")
            critical |= exp == "E05" and row.get("answer") != oracle["expected"]
            critical |= bool(exp == "E08" and not oracle["expected"].get("allowed") and (answer.get("allowed") or answer.get("executed_effects")))
            critical |= exp == "E06" and answer.get("irreversible_effect_count", 0) > 1
            critical |= exp == "E11" and not correct
            critical |= exp == "E10" and any(answer.get(field) != oracle["expected"].get(field) for field in ("active_topology", "mission_id", "preserved_obligations"))
            bucket["critical_failures"] += int(critical)
            telemetry = row.get("telemetry", {})
            if isinstance(telemetry.get("latency_ms"), (int, float)):
                bucket["latency_ms"].append(telemetry["latency_ms"])
            bucket["input_bytes"] += int(telemetry.get("input_bytes", 0))
            bucket["output_bytes"] += int(telemetry.get("output_bytes", 0))
    return dict(summary)


def finalize(summary):
    output = {}
    for exp, data in summary.items():
        latencies = sorted(data.pop("latency_ms"))
        data["accuracy"] = data["correct_runs"] / data["runs"] if data["runs"] else 0
        middle = len(latencies) // 2
        data["latency_p50_ms"] = (latencies[middle] + latencies[middle - 1]) / 2 if len(latencies) % 2 == 0 and latencies else latencies[middle] if latencies else None
        output[exp] = data
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--condition", required=True)
    parser.add_argument("--experiment", choices=[f"E{number:02d}" for number in range(1, 13)])
    parser.add_argument("--experiments", nargs="+", choices=[f"E{number:02d}" for number in range(1, 13)])
    args = parser.parse_args()
    experiments = args.experiments or ([args.experiment] if args.experiment else None)
    expected = scoped_oracle(load_oracle(), experiments)
    experiment = experiments[0] if experiments and len(experiments) == 1 else None
    grouped = load_results(args.results, args.condition, experiment)
    if experiments and len(experiments) > 1:
        allowed = set(experiments)
        grouped = {key: rows for key, rows in grouped.items()
                   if rows[0].get("experiment_id") in allowed}
    summary = finalize(summarize(grouped, expected))
    known = set(expected)
    unexpected = sorted(set(grouped) - known)
    report = {"protocol": "OMEGA-BENCH-2026", "condition_id": args.condition,
              "experiment_scope": experiments or "all",
              "status": "descriptive_only_not_significance_test",
              "unexpected_scenario_ids": unexpected, "summary": summary}
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
