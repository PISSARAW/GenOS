"""Generate deterministic OMEGA-BENCH cases and independent oracle files."""
import hashlib
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261027
DATASET_VERSION = "0.6.0"
MISSION_CATALOG_VERSION = "1.0.0"
E04_TRANSFORMATIONS = ["combine_adjacent_additions", "combine_adjacent_multiplications",
                      "remove_additive_identity", "remove_multiplicative_identity",
                      "annihilate_zero_multiplication"]
EXPERIMENTS = [f"E{i:02d}" for i in range(1, 13)]
COUNTS = {experiment: 50 for experiment in EXPERIMENTS}
COUNTS.update({"E01": 200, "E02": 200, "E03": 1000, "E04": 100,
               "E05": 100, "E06": 150, "E07": 200, "E08": 1000,
               "E09": 200, "E10": 100, "E12": 100})
TOPOLOGIES = ["trinity", "rhizome", "metapopulation", "holobionte", "biome", "biocenose", "a-team", "syncytium"]
MISSIONS = [
    {"id": "M1", "title": "Réorganisation d'une équipe",
     "status": "source_exact", "source_excerpt": "Quatre agents se répartissent une tâche, échangent leurs résultats et réattribuent une sous-tâche après indisponibilité d'un agent. Expériences concernées : 01, 05, 07.",
     "description": "Quatre agents se répartissent une tâche, échangent leurs résultats et réattribuent une sous-tâche après indisponibilité d'un agent.",
     "experiments": ["E01", "E05", "E07"]},
    {"id": "M2", "title": "Filtrage de commandes adversariales",
     "status": "synthetic_example_derived_from_experiments",
     "source_excerpt": None,
     "description": "Un opérateur reçoit des commandes typées, vérifie les contrats puis bloque toute action non autorisée avant son exécution.",
     "experiments": ["E03", "E08"]},
    {"id": "M3", "title": "Réduction du coût des échanges",
     "status": "synthetic_example_derived_from_experiments",
     "source_excerpt": None,
     "description": "Une équipe transmet des intentions de travail compactes et optimise des séquences équivalentes sans changer leurs résultats.",
     "experiments": ["E02", "E04"]},
    {"id": "M4", "title": "Reprise après panne et changement d'équipe",
     "status": "synthetic_example_derived_from_experiments",
     "source_excerpt": None,
     "description": "Après une panne récupérable, une mission reprend ses tâches restantes puis adapte sa topologie en conservant ses obligations.",
     "experiments": ["E06", "E10"]},
    {"id": "M5", "title": "Adaptation aux ressources collectives",
     "status": "synthetic_example_derived_from_experiments",
     "source_excerpt": None,
     "description": "Une équipe partage un budget limité entre agents selon leurs minima et priorités, puis mesure la viabilité et l'équité de l'allocation.",
     "experiments": ["E11"]},
    {"id": "M6", "title": "Mission portable à grande échelle",
     "status": "synthetic_example_derived_from_experiments",
     "source_excerpt": None,
     "description": "Une mission augmente le nombre d'agents et transfère ses intentions entre backends sans perdre leur sens.",
     "experiments": ["E09", "E12"]},
]


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
    left, right = rng.randint(2, 9), rng.randint(2, 9)
    target = E04_TRANSFORMATIONS[index % len(E04_TRANSFORMATIONS)]
    programs = {
        "combine_adjacent_additions": [{"op": "add", "value": left}, {"op": "add", "value": right}],
        "combine_adjacent_multiplications": [{"op": "mul", "value": left}, {"op": "mul", "value": right}],
        "remove_additive_identity": [{"op": "add", "value": 0}, {"op": "mul", "value": left}],
        "remove_multiplicative_identity": [{"op": "mul", "value": 1}, {"op": "add", "value": right}],
        "annihilate_zero_multiplication": [{"op": "add", "value": left}, {"op": "mul", "value": 0}, {"op": "add", "value": right}],
    }
    program = programs[target]
    value = start
    for operation in program:
        value = value + operation["value"] if operation["op"] == "add" else value * operation["value"]
    return {"program": program, "initial": start, "source_operation_count": len(program),
            "optimization_target_count": 2 if target == "annihilate_zero_multiplication" else 1,
            "optimization_target": target,
            "optimization_allowed": E04_TRANSFORMATIONS}, {"result": value}


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
    operation = {"id": f"operation_{index}", "kind": "CALL", "reference": f"tool-{index % 5}",
                 "state": "open", "dependsOn": [],
                 "arguments": {"record_id": f"record-{index}", "limit": 1 + index % 10}}
    return {"intent": operation, "backend_contract": "echo_arguments",
            "security_probes": ["unauthorized", "malformed"]}, {
                "valid": {"status": "emitted", "value": operation["arguments"], "side_effects": 1},
                "unauthorized": {"status": "blocked", "reason_class": "unauthorized", "side_effects": 0},
                "malformed": {"status": "blocked", "reason_class": "invalid_operation", "side_effects": 0}}


BUILDERS = [semantic_case, compression_case, typing_case, optimize_case, replay_case, resilience_case, communication_case, security_case, scalability_case, morphogenesis_case, physiology_case, portability_case]


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(canonical(row) + "\n" for row in rows), encoding="utf-8")


def content_sha256(path):
    return hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def write_mission_catalog(assignments):
    dataset_root = ROOT / "dataset"
    catalog_path = dataset_root / "missions" / "catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog = {"catalog_version": MISSION_CATALOG_VERSION,
        "assignment_policy": "each experiment is deterministically bound to one mission context; variants are keyed by scenario_id and do not alter the workload input or oracle",
        "context_role": "public scenario metadata for grouping and stratification; not evidence that an integrated GenOS mission service was executed",
        "missions": MISSIONS}
    catalog_bytes = (json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    catalog_path.write_bytes(catalog_bytes)
    assignments_path = dataset_root / "public" / "mission-assignments.jsonl"
    write_jsonl(assignments_path, assignments)
    assignment_hash = content_sha256(assignments_path)
    parent_manifest_path = dataset_root / "manifest.json"
    parent_manifest_hash = content_sha256(parent_manifest_path)
    parent_manifest_raw_hash = hashlib.sha256(parent_manifest_path.read_bytes()).hexdigest()
    extension_manifest = {"catalog_version": MISSION_CATALOG_VERSION,
        "hash_policy": "SHA-256 of UTF-8 text after line-ending normalization to LF",
        "interpretation": "mission fields label and stratify public scenarios; they do not change candidate workloads, oracles or executed GenOS services",
        "parent_dataset_version": DATASET_VERSION,
        "parent_dataset_manifest_sha256": parent_manifest_hash,
        "parent_dataset_manifest_raw_sha256": parent_manifest_raw_hash,
        "mission_count": len(MISSIONS), "assignment_count": len(assignments),
        "variants_by_experiment": {experiment: sum(row["experiment_id"] == experiment
            for row in assignments) for experiment in EXPERIMENTS},
        "sha256": {"missions/catalog.json": content_sha256(catalog_path),
            "public/mission-assignments.jsonl": assignment_hash}}
    manifest_path = dataset_root / "missions" / "manifest.json"
    manifest_path.write_bytes((json.dumps(extension_manifest, ensure_ascii=False, indent=2) + "\n")
        .encode("utf-8"))


def mission_for(experiment, index):
    missions = [mission for mission in MISSIONS if experiment in mission["experiments"]]
    if not missions:
        raise ValueError(f"no mission is bound to {experiment}")
    return missions[index % len(missions)]


def assignment_for(row, index, counts):
    experiment = row["experiment_id"]
    mission = mission_for(experiment, index)
    mission_id = mission["id"]
    counts[mission_id] = counts.get(mission_id, 0) + 1
    return {"scenario_id": row["scenario_id"], "experiment_id": experiment,
        "mission_id": mission_id, "mission_variant_id": f"{mission_id}-V{counts[mission_id]:05d}",
        "mission_context_status": mission["status"],
        "mission_context": mission["description"], "variant_index": index}


def experiment_assignments(experiment, public_inputs, counts):
    rows = [row for row in public_inputs if row["experiment_id"] == experiment]
    if len(rows) < 50:
        raise ValueError(f"{experiment} has fewer than 50 public variants")
    return [assignment_for(row, index, counts) for index, row in enumerate(rows)]


def mission_assignments(public_inputs):
    counts = {}
    return [assignment for experiment in EXPERIMENTS
        for assignment in experiment_assignments(experiment, public_inputs, counts)]


def build_experiment(number, count):
    experiment = f"E{number:02d}"
    inputs, oracle = [], []
    for index in range(count):
        rng = random.Random(f"{SEED}:{experiment}:{index}")
        scenario_id = f"{experiment}-{index:03d}"
        case_input, expected = BUILDERS[number - 1](index, rng)
        inputs.append({"scenario_id": scenario_id, "experiment_id": experiment, "seed": SEED + index, "input": case_input})
        oracle.append({"scenario_id": scenario_id, "experiment_id": experiment, "expected": expected})
    return inputs, oracle


def main():
    digests = {}
    public_inputs = []
    oracles_by_experiment = {}
    for number in range(1, 13):
        experiment = f"E{number:02d}"
        inputs, oracle = build_experiment(number, COUNTS[experiment])
        public_inputs.extend(inputs)
        oracles_by_experiment[experiment] = oracle
    assignments = mission_assignments(public_inputs)
    assignment_by_id = {row["scenario_id"]: row for row in assignments}
    inputs_by_experiment = {experiment: [] for experiment in EXPERIMENTS}
    for row in public_inputs:
        enriched = {**row, **{key: assignment_by_id[row["scenario_id"]][key]
            for key in ("mission_id", "mission_variant_id", "mission_context_status", "mission_context")}}
        inputs_by_experiment[row["experiment_id"]].append(enriched)
    for experiment in EXPERIMENTS:
        input_rows = inputs_by_experiment[experiment]
        oracle_rows = oracles_by_experiment[experiment]
        write_jsonl(ROOT / "dataset" / "public" / "inputs" / f"{experiment}.jsonl", input_rows)
        write_jsonl(ROOT / "dataset" / "oracle" / f"{experiment}.jsonl", oracle_rows)
        for split, rows in (("inputs", input_rows), ("oracle", oracle_rows)):
            data = "".join(canonical(row) + "\n" for row in rows).encode("utf-8")
            digests[f"{split}/E{experiment[1:]}.jsonl"] = hashlib.sha256(data).hexdigest()
    manifest = {"protocol": "OMEGA-BENCH-2026", "dataset_version": DATASET_VERSION, "seed": SEED,
                "cases_by_experiment": COUNTS, "total_cases": sum(COUNTS.values()),
                "split": "public_development_only", "sha256": digests}
    (ROOT / "dataset" / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_mission_catalog(assignments)
    print(f"Generated {manifest['total_cases']} cases; manifest: dataset/manifest.json")
    print(f"Generated {len(MISSIONS)} missions and {len(assignments)} deterministic public assignments.")


if __name__ == "__main__":
    main()
