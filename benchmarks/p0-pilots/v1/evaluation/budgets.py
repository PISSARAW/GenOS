"""Vérifie les contrôles et les mesures brutes, sans éliminer les échecs."""


def validate_attempt(attempt, spec):
    if attempt.get("requestSkipped"):
        raise ValueError("Incomplete model allocation")
    options = attempt.get("requestOptions")
    if options and options != {"temperature": spec["protocol"]["temperature"],
                               "contextTokens": spec["protocol"]["contextTokens"],
                               "maxTokens": spec["policy"]["maxOutputTokens"]}:
        raise ValueError("Different model controls")
    measured = attempt.get("measurement") or {}
    if not measured.get("measured"):
        return
    if measured["servedModel"] != spec["protocol"]["model"].replace("ollama://", ""):
        raise ValueError("Different served model")
    if measured["outputTokens"] > spec["policy"]["maxOutputTokens"]:
        raise ValueError("Output token allocation exceeded")
    if measured["inputTokens"] + spec["policy"]["maxOutputTokens"] > spec["protocol"]["contextTokens"]:
        raise ValueError("Context token allocation exceeded")


def validate_rows(rows, protocol):
    for row in rows:
        policy = protocol["pilots"][row["pilot"]]
        if len(row["attempts"]) != policy["callsPerCase"] or row["checkCount"] > policy["checksPerCase"]:
            raise ValueError("Different call or checker allocation")
        for attempt in row["attempts"]:
            validate_attempt(attempt, {"protocol": protocol, "policy": policy})
