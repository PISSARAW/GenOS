"""Fail closed on incomplete coverage, altered missions and forged PASS values."""
from collections import Counter
from sources import resolve, walk


EXPECTED = {"cases": 48, "attempts": 88, "worlds": 324,
            "historicalPass": 71, "heterogeneousRefusals": 5, "promotions": 0}


def counts(payload):
    workers = payload["workers"]
    return {"cases": len(payload["missions"]), "attempts": len(payload["attempts"]),
            "worlds": len(workers),
            "historicalPass": sum(w["disposition"]["historicalFixturePass"] for w in workers),
            "heterogeneousRefusals": sum(a["compositionRefused"] for a in payload["attempts"]),
            "promotions": sum(w["disposition"]["promotion"]["value"] is True for w in workers)}


def unique(rows, key):
    identifiers = [row[key] for row in rows]
    if None in identifiers or len(identifiers) != len(set(identifiers)):
        raise ValueError("Missing or duplicate identifiers: " + key)


def mission_coverage(rows, missions):
    expected = {row["id"]: row for row in missions}
    if set(expected) != {row["caseId"] for row in rows}:
        raise ValueError("Mission source coverage differs from registry")
    if len(expected) != len(missions):
        raise ValueError("Duplicate mission source IDs")
    for row in rows:
        clauses = row["originalClauses"]
        text = expected[row["caseId"]]["mission"]
        if row["originalText"] != text or "".join(c["text"] for c in clauses) != text:
            raise ValueError("Original clauses do not cover whole mission")
        clause_offsets(clauses, text)


def clause_offsets(clauses, text):
    cursor = 0
    for clause in clauses:
        if clause["start"] != cursor or text[cursor:clause["end"]] != clause["text"]:
            raise ValueError("Invalid original clause offset")
        if clause["status"] != "unknown" or clause["proofRefs"]:
            raise ValueError("Original requirement qualified without new evidence")
        cursor = clause["end"]
    if cursor != len(text):
        raise ValueError("Missing original text suffix")


def hierarchy(payload):
    cases = {row["caseId"]: row for row in payload["missions"]}
    attempts = {row["attemptId"]: row for row in payload["attempts"]}
    for attempt in attempts.values():
        if attempt["attemptId"] not in cases[attempt["caseId"]]["attemptIds"]:
            raise ValueError("Attempt absent from parent case")
    for worker in payload["workers"]:
        if worker["workerId"] not in attempts[worker["attemptId"]]["workers"]:
            raise ValueError("Worker absent from parent attempt")
    for attempt in attempts.values():
        if attempt["compositionRefused"] and attempt["workers"]:
            raise ValueError("Refused composition cannot create worker worlds")


def locators(payload, catalog):
    documents = {doc.label: doc for doc in catalog.documents}
    for _, value in walk(payload):
        if isinstance(value, dict) and set(value) == {"document", "pointer", "sha256"}:
            document = documents[value["document"]]
            if value["sha256"] != document.sha256:
                raise ValueError("Forged source locator hash")
            resolve(document.data, value["pointer"])


def variant_counts(payload):
    result = {}
    for case in payload["missions"]:
        result.setdefault(case["variant"], Counter())["cases"] += 1
    for attempt in payload["attempts"]:
        result[attempt["variant"]]["attempts"] += 1
    for worker in payload["workers"]:
        values = result[worker["variant"]]
        values["worlds"] += 1
        values["historicalPass"] += int(worker["disposition"]["historicalFixturePass"])
    return {key: {name: value.get(name, 0) for name in ("cases", "attempts", "worlds", "historicalPass")}
            for key, value in result.items()}


def validate(payload, catalog, expected):
    unique(payload["missions"], "caseId")
    unique(payload["attempts"], "attemptId")
    unique(payload["workers"], "workerId")
    mission_coverage(payload["missions"], payload.pop("_missionSource"))
    hierarchy(payload)
    locators(payload, catalog)
    actual = counts(payload)
    if actual != expected:
        raise ValueError("Canonical counts differ: " + str(actual))
    return {"counts": actual, "variants": variant_counts(payload),
            "sourceCoverage": True, "hashChecks": True, "originalClauseCoverage": True,
            "qualifiedMissions": 0, "semanticValidation": "not_performed",
            "externalReferenceVerification": "not_performed"}
