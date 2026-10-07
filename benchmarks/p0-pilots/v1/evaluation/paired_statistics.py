"""Contrastes appariés exploratoires sur les tâches, jamais sur les tentatives."""
import math
import random
import statistics


def paired_test(wins, losses):
    count = wins + losses
    if not count:
        return 1.0
    tail = sum(math.comb(count, value) for value in range(min(wins, losses) + 1)) / 2 ** count
    return min(1.0, 2 * tail)


def paired_interval(differences):
    rng = random.Random(20261007)
    means = sorted(statistics.mean(rng.choices(differences, k=len(differences))) for _ in range(4000))
    return [means[100], means[3899]]


def comparisons(rows, arms):
    full = {row["caseId"]: int(row["correct"]) for row in rows if row["arm"] == "genos"}
    contrasts = []
    for arm in arms:
        if arm == "genos":
            continue
        other = {row["caseId"]: int(row["correct"]) for row in rows if row["arm"] == arm}
        ids = sorted(full.keys() & other.keys())
        differences = [full[key] - other[key] for key in ids]
        wins, losses = differences.count(1), differences.count(-1)
        contrasts.append({"baselineOrAblation": arm, "tasks": len(ids),
                          "pairedDifference": statistics.mean(differences),
                          "bootstrap95": paired_interval(differences), "wins": wins, "losses": losses,
                          "exactDiscordanceP": paired_test(wins, losses)})
    return contrasts


def attempt_metrics(attempts):
    measured = [attempt["measurement"] for attempt in attempts if attempt.get("measurement", {}).get("measured")]
    return {"attemptErrors": sum(bool(attempt.get("error")) for attempt in attempts),
            "inputTokensMeasured": sum(item["inputTokens"] for item in measured),
            "outputTokensMeasured": sum(item["outputTokens"] for item in measured),
            "unmeasuredCalls": len(attempts) - len(measured)}


def outcome_counts(rows):
    return {"n": len(rows), "correct": sum(row["correct"] for row in rows),
            "abstentions": sum(row["selected"] is None for row in rows),
            "unverifiedSelections": sum(row.get("unverifiedSelection", False) for row in rows),
            "attackFollowed": sum(row.get("attackFollowed", False) for row in rows)}


def arm_summary(rows):
    attempts = [attempt for row in rows for attempt in row["attempts"]]
    latencies = [row["durationMs"] for row in rows]
    return {**outcome_counts(rows), **attempt_metrics(attempts),
            "modelCalls": sum(row["callCount"] for row in rows),
            "medianCaseLatencyMs": statistics.median(latencies), "maxCaseLatencyMs": max(latencies)}


def summary(rows, protocol):
    result = {}
    for pilot, policy in protocol["pilots"].items():
        selected = [row for row in rows if row["pilot"] == pilot]
        result[pilot] = {"arms": {arm: arm_summary([row for row in selected if row["arm"] == arm])
                                 for arm in policy["arms"]},
                         "contrasts": comparisons(selected, policy["arms"])}
    return result
