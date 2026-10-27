"""Generate deterministic OMEGA-BENCH cases and independent oracle files."""
import hashlib
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261027
EXPERIMENTS = [f"E{i:02d}" for i in range(1, 13)]
COUNTS = {experiment: 50 for experiment in EXPERIMENTS}
COUNTS.update({"E01": 200, "E02": 200, "E03": 1000, "E04": 100,
               "E05": 100, "E06": 150, "E07": 200, "E08": 1000,
               "E09": 200, "E10": 100, "E12": 100})
TOPOLOGIES = ["trinity", "rhizome", "metapopulation", "holobionte", "biome", "biocenose", "a-team", "syncytium"]


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def semantic_case(index, rng):
    subject = f"parcel-{index:03d}"
    quantity = rng.randint(2, 90)
    return {"intent": f"Move {quantity} units of {subject} from stock to dispatch after checking availability.", "facts": {"available": quantity + rng.randint(0, 20), "unit": "item"}}, {"operations": [{"kind": "READ", "reference": f"stock/{subject}"}, {"kind": "CHECK", "reference": f"availability>={quantity}"}, {"kind": "CALL", "reference": "dispatch", "quantity": quantity}]}


def compression_case(index, rng):
    width = 2 + index % 5
    records = [{"id": f"r{index}-{n}", "status": "ready", "value": rng.randint(0, 999), "unit": "ms"} for n in range(width)]
    return {"object": {"domain": "telemetry", "records": records, "required_fields": ["id", "value"]}}, {"decoded_object": {"domain": "telemetry", "records": records, "required_fields": ["id", "value"]}}


def typing_case(index, rng):
    valid = index % 2 == 0
    candidate = {"schema": "genos.gcir.omega/v1", "version": 1, "id": f"typing-{index}", "operations": [{"id": "read", "kind": "READ", "reference": "repo", "dependsOn": [], "state": "open"}], "policy": {"read": ["repo"]}, "payload": {"case": index, "nonce": rng.randint(1, 100)}}
    if not valid and index % 4 == 1:
        candidate["operations"][0]["kind"] = "EXECUTE"
    elif not valid:
        candidate["operations"][0].pop("state")
    return {"candidate": candidate}, {"accepted": valid}


def optimize_case(index, rng):
    start = rng.randint(1, 30)
    left, right = rng.randint(1, 20), rng.randint(1, 20)
    return {"program": [{"op": "add", "value": left}, {"op": "add", "value": right}], "initial": start, "source_operation_count": 2, "optimization_target_count": 1, "optimization_allowed": ["combine_adjacent_additions"]}, {"result": start + left + right}


def replay_case(index, rng):
    first = rng.randint(1, 20)
    second = rng.randint(1, 20)
    events = [{"event_id": f"{index}-1", "op": "set", "key": "balance", "value": first}, {"event_id": f"{index}-2", "op": "add", "key": "balance", "value": second}]
    return {"workflow_id": f"wf-{index}", "events": events, "replay_count": 10}, {
        "state": {"balance": first + second}, "observable_effects": [f"set:{first}", f"add:{second}"],
        "replay_count": 10, "all_replays_match": True
    }


def resilience_case(index, rng):
    mission_index, fraction_index = divmod(index, 3)
    fraction = (0.1, 0.25, 0.5)[fraction_index]
    task_count = 20
    tasks = [f"task-{mission_index}-{n}" for n in range(task_count)]
    fail_at = max(0, int(task_count * fraction) - 1)
    return {"tasks": tasks, "crash_after_task_index": fail_at, "failure_fraction": fraction,
            "recoverable": True, "delivery": "at_least_once",
            "effect_key": f"mission-{mission_index}"}, {
                "completed_tasks": tasks, "irreversible_effect_count": 1
            }


def communication_case(index, rng):
    size = (2, 8, 32, 128)[index // 50]
    agents = [f"agent-{n}" for n in range(size)]
    tasks = [{"id": f"work-{index}-{n}", "agent": agents[n % len(agents)], "depends_on": [] if n == 0 else [f"work-{index}-{n-1}"]} for n in range(len(agents))]
    return {"agents": agents, "tasks": tasks, "delivery_guarantee": "at_least_once"}, {"delivered_task_ids": [task["id"] for task in tasks], "unresolved_dependencies": []}


def security_case(index, rng):
    permitted = index % 4 == 0
    principal = "operator" if permitted else "observer"
    return {"principal": principal, "action": "delete" if index % 3 == 0 else "read", "resource": f"resource-{index}", "policy": {"operator": ["read", "delete"], "observer": ["read"]}}, {"allowed": permitted or index % 3 != 0, "executed_effects": ["requested_action"] if permitted or index % 3 != 0 else []}


def scalability_case(index, rng):
    agents = [10, 100, 1000, 10000][index // 50]
    commands = agents * (1 + index % 3)
    return {"simulated_agents": agents, "command_count": commands, "command_value_start": index}, {"processed_count": commands, "checksum": sum(range(index, index + commands))}


def morphogenesis_case(index, rng):
    source = TOPOLOGIES[index % len(TOPOLOGIES)]
    target = TOPOLOGIES[(index + 1 + index % 3) % len(TOPOLOGIES)]
    invariants = ["mission_id_preserved", "pending_obligations_preserved", "effect_authority_preserved"]
    return {"from_topology": source, "to_topology": target, "mission_id": f"mission-{index}", "open_obligations": [f"obligation-{index}-a", f"obligation-{index}-b"], "invariants": invariants}, {"active_topology": target, "mission_id": f"mission-{index}", "preserved_obligations": [f"obligation-{index}-a", f"obligation-{index}-b"], "violations": []}


def physiology_case(index, rng):
    budget = 8 + index % 8
    demands = [{"agent": f"agent-{n}", "minimum": 1, "priority": (n + index) % 4 + 1} for n in range(4)]
    remaining = budget
    allocation = {item["agent"]: 0 for item in demands}
    for _ in range(budget):
        chosen = max((item for item in demands if allocation[item["agent"]] < item["minimum"] + 3), key=lambda item: (item["priority"], -int(item["agent"].split("-")[1])))
        allocation[chosen["agent"]] += 1
        remaining -= 1
    return {"resource_budget": budget, "demands": demands,
            "allocation_rule": "conserve_budget; satisfy_minimums; preserve_priority_order_when_demands_match"}, {
                "allocation_contract": {"resource_budget": budget, "demands": demands,
                    "priority_fairness": "equal-demand higher-priority agents receive no less"}}


def portability_case(index, rng):
    operation = {"kind": "CALL", "tool": f"tool-{index % 5}", "arguments": {"record_id": f"record-{index}", "limit": 1 + index % 10}}
    return {"intent": operation, "representations": ["json", "tabular", "portable"]}, {"canonical_operation": operation, "equivalent": True}


BUILDERS = [semantic_case, compression_case, typing_case, optimize_case, replay_case, resilience_case, communication_case, security_case, scalability_case, morphogenesis_case, physiology_case, portability_case]


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(canonical(row) + "\n" for row in rows), encoding="utf-8")


def build_experiment(number, count):
    experiment = f"E{number:02d}"
    inputs, oracle = [], []
    for index in range(count):
        rng = random.Random(f"{SEED}:{experiment}:{index}")
        scenario_id = f"{experiment}-{index:03d}"
        case_input, expected = BUILDERS[number - 1](index, rng)
        inputs.append({"scenario_id": scenario_id, "experiment_id": experiment, "seed": SEED + index, "input": case_input})
        oracle.append({"scenario_id": scenario_id, "experiment_id": experiment, "expected": expected})
    write_jsonl(ROOT / "dataset" / "public" / "inputs" / f"{experiment}.jsonl", inputs)
    write_jsonl(ROOT / "dataset" / "oracle" / f"{experiment}.jsonl", oracle)
    return inputs, oracle


def main():
    digests = {}
    for number in range(1, 13):
        experiment = f"E{number:02d}"
        inputs, oracle = build_experiment(number, COUNTS[experiment])
        for split, rows in (("inputs", inputs), ("oracle", oracle)):
            data = "".join(canonical(row) + "\n" for row in rows).encode("utf-8")
            digests[f"{split}/E{number:02d}.jsonl"] = hashlib.sha256(data).hexdigest()
    manifest = {"protocol": "OMEGA-BENCH-2026", "dataset_version": "0.3.0", "seed": SEED,
                "cases_by_experiment": COUNTS, "total_cases": sum(COUNTS.values()),
                "split": "public_development_only", "sha256": digests}
    (ROOT / "dataset" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {manifest['total_cases']} cases; manifest: dataset/manifest.json")


if __name__ == "__main__":
    main()
