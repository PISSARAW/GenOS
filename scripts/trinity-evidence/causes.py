"""Classify recorded symptoms, without claiming a root cause or copying logs."""
import json


PATTERNS = (
    ("biological_worker_mission_ambiguous", "mission_binding_ambiguous"),
    ("biological_worker_receipt_sealed", "receipt_already_sealed"),
    ("no such column: organization_id", "tenant_schema_lookup_failed"),
    ("no workspace delegation", "workspace_authority_missing"),
    ("minimum diversity", "diversity_below_threshold"),
    ("tool_missing", "native_tool_unavailable"),
    ("no capability requirements", "role_capability_unresolved"),
    ("--approve-for-me", "executor_cli_incompatible"),
    ("deadlock", "deadlock_guard_stopped"),
    ("tokens budget exhausted", "token_guard_stopped"),
    ("enoent", "path_not_found"),
    ("requires every expected world", "world_completion_barrier"),
    ("world_execution_incomplete", "world_completion_barrier"),
    ("supervisor_timeout", "supervisor_timeout"),
    ("timed out", "supervisor_timeout"),
    ("timeout", "timeout_reported"),
)


def category(value):
    text = json.dumps(value, ensure_ascii=False).lower()
    for needle, name in PATTERNS:
        if needle in text:
            return name
    return "unclassified_recorded_issue"


def observation(value, source):
    if value is None:
        return {"state": "unknown", "category": None, "source": source}
    result = {"state": "observed", "category": category(value), "source": source,
              "interpretation": "reported_symptom_not_verified_root_cause"}
    if isinstance(value, dict):
        result["eventType"] = value.get("event", value.get("type"))
        result["time"] = value.get("time")
    return result


def recorded_value(value, source):
    return {"state": "unknown" if value is None else "observed",
            "value": value, "source": source}


def primary_selection(world, group):
    selectors = {
        "controlled-factorial": (world.get("firstBlockage"), "/firstBlockage"),
        "adversarial-temporal": ((world.get("runtime") or {}).get("primaryCause"),
                                 "/runtime/primaryCause"),
        "jury-recursive": ((world.get("causalAssessment") or {}).get("firstObservedFailure"),
                           "/causalAssessment/firstObservedFailure"),
    }
    return selectors[group]


def cascade_selection(world, group):
    selectors = {
        "controlled-factorial": (world.get("cascades", []), "/cascades"),
        "jury-recursive": ((world.get("causalAssessment") or {}).get("observedCascade", []),
                           "/causalAssessment/observedCascade"),
        "adversarial-temporal": ([], None),
    }
    return selectors[group]


def world_causes(world, context):
    primary, suffix = primary_selection(world, context["group"])
    source = context["source"](suffix, primary)
    result = {"primary": observation(primary, source), "cascades": []}
    cascade, suffix = cascade_selection(world, context["group"])
    for index, item in enumerate(cascade):
        if item != primary:
            ref = context["source"](suffix + "/" + str(index), item)
            result["cascades"].append(observation(item, ref))
    result["cascadeObservation"] = "observed" if cascade else "non_observed"
    result["chronologyLimit"] = "Recorded first symptom; undated logs do not establish total order"
    stop = (world.get("causalAssessment") or {}).get("guardrailReason")
    result["finalStop"] = observation(stop, context["source"]("/causalAssessment", stop))
    return result


def attempt_causes(attempt, context):
    value = attempt.get("firstAttemptBlockage")
    source = context["source"]("/firstAttemptBlockage", value)
    final = attempt.get("reason")
    result = {"primary": observation(value, source),
              "finalStop": observation(final, context["source"]("/reason", final))}
    if context["group"] == "jury-recursive":
        captured = attempt.get("capturedExperiment") or {}
        final = captured.get("failure_reason")
        result["finalStop"] = observation(final, context["source"]("/capturedExperiment", captured))
    result["workerPrimariesAreSeparate"] = True
    return result
