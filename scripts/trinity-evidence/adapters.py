"""Normalize the three historical schemas using allowlisted values and locators."""
from causes import attempt_causes, recorded_value, world_causes
from requirements import addition_selector, case_obligations, original_clauses
from sources import resolve


def context(catalog, document, pointer):
    def source(suffix, _value=None):
        candidate = pointer + suffix
        while candidate:
            try:
                return catalog.ref(document, candidate)
            except (KeyError, IndexError, TypeError, ValueError):
                candidate = candidate.rsplit("/", 1)[0]
        return catalog.ref(document, "")
    return {"group": document.label, "source": source}


def is_zero(value):
    return type(value) is int and value == 0


def worker_shape(world, group):
    if group == "controlled-factorial":
        check = world.get("check") or {}
        passed = is_zero((check.get("independentCheck") or {}).get("exitCode"))
        passed = passed or is_zero(check.get("oracleExitCode"))
        return {"agentId": world.get("agentId"), "statuses": world.get("statuses"),
                "pass": passed, "control": check.get("controlIntegrity"),
                "promotion": None, "assignment": world.get("assignment") or {},
                "promotionSuffix": "/answerReview"}
    if group == "adversarial-temporal":
        answer = world.get("answer") or {}
        return {"agentId": world.get("workerId"), "statuses": None,
                "pass": answer.get("previousIndependentPass") is True,
                "control": answer.get("previousControlIntegrity"), "promotion": None,
                "assignment": {}, "promotionSuffix": "/conclusions"}
    return {"agentId": world.get("agentId"), "statuses": world.get("captured"),
            "pass": is_zero((world.get("replay") or {}).get("exitCode")),
            "control": None, "assignment": world.get("identity") or {},
            "promotion": (world.get("qualitativeReview") or {}).get("promotion"),
            "promotionSuffix": "/qualitativeReview/promotion"}


def disposition(world, ctx):
    shape = worker_shape(world, ctx["group"])
    return {"historicalFixturePass": shape["pass"],
            "controlIntegrity": recorded_value(shape["control"], ctx["source"]("")),
            "worldValidity": {"state": "unknown", "source": ctx["source"]("")},
            "promotion": recorded_value(shape["promotion"],
                                       ctx["source"](shape["promotionSuffix"])),
            "interpretation": "Historical fixture PASS does not qualify original mission or promotion"}


def identity(world, ctx):
    shape = worker_shape(world, ctx["group"])
    assigned = shape["assignment"]
    if ctx["group"] == "adversarial-temporal":
        assigned = {"type": world.get("agentType"), "role": world.get("roleActual"),
                    "workerKind": world.get("workerKind"),
                    "parentId": (world.get("topology") or {}).get("parentId")}
    return {"agentId": shape["agentId"], "worldNumber": world.get("worldNumber"),
            "type": assigned.get("type"), "role": assigned.get("role"),
            "workerKind": assigned.get("workerKind"),
            "parentId": assigned.get("parentId", assigned.get("parent")),
            "source": ctx["source"](""),
            "providerObservation": {"state": "audit_reported_not_normalized",
                                    "source": runtime_ref(ctx), "routeVerified": False},
            "runtimeStatuses": status_summary(world, ctx["group"])}


def status_summary(world, group):
    if group == "adversarial-temporal":
        runtime = world.get("runtime") or {}
        return {key: runtime.get(key) for key in ("agentStatus", "worldStatus", "runStatus")}
    raw = worker_shape(world, group)["statuses"] or {}
    return {key: raw.get(key) for key in ("world", "agent", "run", "worldStatus", "agentStatus")}


def runtime_ref(ctx):
    suffixes = {"controlled-factorial": "/observedRuntime",
                "adversarial-temporal": "/actualProviderModel", "jury-recursive": "/log"}
    return ctx["source"](suffixes[ctx["group"]])


def facets(world, ctx):
    groups = {
        "controlled-factorial": {"response": "/answerReview", "verification": "/check",
          "receipts": "/receipts", "accounting": "/accounting", "components": "/components",
          "communication": "/communication", "commands": "/commands", "provenance": "/worldEvidenceVector"},
        "adversarial-temporal": {"response": "/answer", "verification": "/answer/staticContract",
          "receipts": "/biologicalReceipt", "accounting": "/budget", "components": "/components",
          "communication": "/communications", "commands": "/steps", "provenance": "/answer/claimVerification"},
        "jury-recursive": {"response": "/qualitativeReview", "verification": "/replay",
          "receipts": "/biologicalReceipts", "accounting": "/strategyRuns", "components": "/currentDatabase",
          "communication": "/messages", "commands": "/commands", "provenance": "/captured/evidenceVector"},
    }
    return {key: {"source": ctx["source"](suffix), "valueNotCopied": True,
                  "observation": facet_presence(world, suffix)}
            for key, suffix in groups[ctx["group"]].items()}


def facet_presence(world, suffix):
    try:
        value = resolve(world, suffix)
    except (KeyError, TypeError, IndexError):
        return "unknown"
    if value in (None, [], {}, ""):
        return "non_observed_in_audit_field"
    return "reported_present_not_validated"


def worker_record(world, ctx):
    return {**identity(world, ctx), "disposition": disposition(world, ctx),
            "causes": world_causes(world, ctx), "facets": facets(world, ctx),
            "source": ctx["source"](""), "evidenceQualification": "audit_reported_not_reexecuted"}


def attempt_record(attempt, ctx):
    group = ctx["group"]
    identifier = attempt.get("attemptId", attempt.get("id"))
    selectors = {"controlled-factorial": ("worlds", "/chronology/transportExit"),
                 "adversarial-temporal": ("workers", "/transportExitCode"),
                 "jury-recursive": ("worlds", "/dispatch/exitCode")}
    workers_key, exit_suffix = selectors[group]
    try:
        transport = resolve(attempt, exit_suffix)
    except (KeyError, TypeError):
        transport = None
    return {"attemptId": identifier, "executor": attempt.get("executor"),
            "transportExit": recorded_value(transport, ctx["source"](exit_suffix)),
            "causes": attempt_causes(attempt, ctx), "source": ctx["source"](""),
            "workersKey": workers_key, "workers": [],
            "runtimeVersion": {"state": "reported_only", "source": version_ref(ctx)}}


def version_ref(ctx):
    selectors = {"controlled-factorial": "/runtimeHashes",
                 "adversarial-temporal": "/recordedRuntimeAuthorityHash",
                 "jury-recursive": "/capturedExperiment"}
    return ctx["source"](selectors[ctx["group"]])


def case_record(case, mission, ctx):
    source = ctx["source"]("/originalMission")
    if case["originalMission"] != mission["mission"]:
        raise ValueError("Original mission text differs from anchor: " + mission["id"])
    if (case["variant"], case["level"]) != (mission["variant"], mission["level"]):
        raise ValueError("Mission variant/level differs from anchor")
    return {"caseId": mission["id"], "variant": mission["variant"], "level": mission["level"],
            "originalText": mission["mission"], "source": source,
            "originalClauses": original_clauses(mission, source),
            "additionalObligations": case_obligations(case, source),
            "historicalAddedFixture": {"source": ctx["source"](addition_selector(case, ctx["group"])),
              "scope": "historical_added_contract_separate_from_original", "valueNotCopied": True},
            "attemptIds": [], "contractProfile": "documentary_registry_not_active_approved_contract"}
