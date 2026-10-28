"""Independent Python oracles for public synthetic mission workload variants."""
import json


def security_filter(workload):
    decisions = [command["action"] in workload["policy"].get(command["principal"], [])
        for command in workload["commands"]]
    return {"decisions": decisions, "executed_effects": sum(decisions), "violations": []}


def message_round_trip(workload):
    decoded = json.loads(json.dumps(workload["messages"], ensure_ascii=False,
        sort_keys=True, separators=(",", ":")))
    preserved = decoded == workload["messages"]
    return {"delivered_message_ids": [message["id"] for message in decoded],
        "messages_preserved": preserved, "violations": [] if preserved else ["message_loss"]}


def recoverable_handoff(workload):
    prefix = workload["tasks"][:workload["crash_after"] + 1]
    resumed = prefix + workload["tasks"][len(prefix):]
    return {"completed_tasks": list(dict.fromkeys(resumed)), "irreversible_effect_count": 1,
        "violations": []}


def collective_budget(workload):
    demands = workload["demands"]
    allocation = {item["agent"]: item["minimum"] for item in demands}
    remaining = workload["budget"] - sum(allocation.values())
    for _ in range(remaining):
        chosen = max((item for item in demands if allocation[item["agent"]] < 4),
            key=lambda item: (item["priority"], -int(item["agent"].split("-")[1])))
        allocation[chosen["agent"]] += 1
    return {"allocation": allocation, "allocated_total": workload["budget"], "violations": []}


def portable_scale(workload):
    operation = workload["operation"]
    table = {"id": operation["id"], "kind": operation["kind"],
        "reference": operation["reference"], "arguments": operation["arguments"]}
    results = [table if backend == "tabular" else operation
        for backend in workload["backends"]]
    return {"agent_count": workload["agents"], "processed_agents": workload["agents"],
        "transfer_count": workload["agents"] * len(workload["backends"]),
        "backend_results": results, "equivalent": all(item == operation for item in results),
        "violations": []}


ORACLES = {"security_filter": security_filter, "message_round_trip": message_round_trip,
    "recoverable_handoff": recoverable_handoff, "collective_budget": collective_budget,
    "portable_scale": portable_scale}


def execute(workload):
    """Dispatch to independent Python mission logic; never loads GenOS code."""
    return ORACLES[workload["kind"]](workload)
