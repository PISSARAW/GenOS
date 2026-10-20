"""Independent paired evaluation for scaffold evolution candidates."""

from __future__ import annotations

from statistics import fmean

from scaffold_lineage import canonical_hash, require_digest


PHASES = ("benchmark", "holdout")
REPORT_FIELDS = {
    "case_id", "seed", "agent_score", "responsibility_score", "contract_sha256",
    "capsule_id", "evidence_refs",
}


def evaluate_campaign(campaign: dict) -> dict:
    """Return a sealed review dossier, never a promotion decision."""
    _validate_campaign(campaign)
    phase_results = {
        phase: _evaluate_phase({"campaign": campaign, "phase": phase})
        for phase in PHASES
    }
    passed = all(result["double_causal_gate"] for result in phase_results.values())
    dossier = {
        "candidate_id": campaign["candidate_id"],
        "parent_id": campaign["parent_id"],
        "evaluator_id": campaign["evaluator_id"],
        "evaluator_sha256": campaign["evaluator_sha256"],
        "status": "AWAITING_PROMOTION_REVIEW" if passed else "EVIDENCE_REJECTED",
        "review_eligible": passed,
        "promotion_decision": None,
        "phase_results": phase_results,
        "provenance_refs": sorted(set(campaign["provenance_refs"])),
    }
    dossier["evaluation_receipt_sha256"] = canonical_hash(dossier)
    return dossier


def _validate_campaign(campaign: dict) -> None:
    required = {
        "candidate_id", "parent_id", "author_id", "evaluator_id", "evaluator_sha256",
        "runner_ids", "cases", "reports", "thresholds", "provenance_refs",
    }
    if not isinstance(campaign, dict) or not required <= campaign.keys():
        raise ValueError("incomplete evaluation campaign")
    require_digest(campaign["evaluator_sha256"], "evaluator_sha256")
    _validate_independence(campaign)
    _validate_cases(campaign["cases"])
    if not isinstance(campaign["provenance_refs"], list) or not campaign["provenance_refs"]:
        raise ValueError("campaign provenance required")
    for phase in PHASES:
        _validate_phase_reports({"campaign": campaign, "phase": phase})


def _validate_independence(campaign: dict) -> None:
    runners = campaign["runner_ids"]
    if not isinstance(runners, dict) or set(runners) != {"baseline", "candidate"}:
        raise ValueError("baseline and candidate runner identities required")
    identities = {campaign["author_id"], campaign["evaluator_id"], *runners.values()}
    if len(identities) != 4:
        raise ValueError("author, evaluator and runners must be independent")


def _validate_cases(cases: dict) -> None:
    if not isinstance(cases, dict) or set(cases) != set(PHASES):
        raise ValueError("benchmark and holdout cases required")
    benchmark = set(cases["benchmark"])
    holdout = set(cases["holdout"])
    if not benchmark or not holdout or benchmark & holdout:
        raise ValueError("benchmark and holdout cases must be non-empty and disjoint")
    if len(benchmark) != len(cases["benchmark"]) or len(holdout) != len(cases["holdout"]):
        raise ValueError("duplicate evaluation case")


def _validate_phase_reports(context: dict) -> None:
    campaign = context["campaign"]
    phase = context["phase"]
    expected_cases = set(campaign["cases"][phase])
    reports = campaign["reports"].get(phase)
    if not isinstance(reports, dict) or set(reports) != {"baseline", "candidate"}:
        raise ValueError(f"paired {phase} reports required")
    for side in ("baseline", "candidate"):
        _validate_rows({"rows": reports[side], "expected_cases": expected_cases, "side": side})
    _paired_rows(reports)
    baseline_capsules = {row["capsule_id"] for row in reports["baseline"]}
    candidate_capsules = {row["capsule_id"] for row in reports["candidate"]}
    if baseline_capsules & candidate_capsules:
        raise ValueError("baseline and candidate capsules must be isolated")


def _validate_rows(context: dict) -> None:
    rows = context["rows"]
    expected_cases = context["expected_cases"]
    if not isinstance(rows, list) or not rows:
        raise ValueError("evaluation rows required")
    observed = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != REPORT_FIELDS:
            raise ValueError("invalid evaluation row contract")
        require_digest(row["contract_sha256"], "contract_sha256")
        if not row["capsule_id"] or not row["evidence_refs"]:
            raise ValueError("capsule and evidence provenance required")
        observed.add((row["case_id"], row["seed"]))
    if {case_id for case_id, _ in observed} != expected_cases or len(observed) != len(rows):
        raise ValueError(f"{context['side']} case or seed coverage mismatch")


def _paired_rows(reports: dict) -> list[tuple[dict, dict]]:
    baseline = {(row["case_id"], row["seed"]): row for row in reports["baseline"]}
    candidate = {(row["case_id"], row["seed"]): row for row in reports["candidate"]}
    if baseline.keys() != candidate.keys():
        raise ValueError("baseline and candidate reports must be paired")
    pairs = [(baseline[key], candidate[key]) for key in sorted(baseline)]
    if any(left["contract_sha256"] != right["contract_sha256"] for left, right in pairs):
        raise ValueError("evaluation contract changed between paired runs")
    return pairs


def _evaluate_phase(context: dict) -> dict:
    campaign = context["campaign"]
    pairs = _paired_rows(campaign["reports"][context["phase"]])
    agent_deltas = [right["agent_score"] - left["agent_score"] for left, right in pairs]
    responsibility_deltas = [
        right["responsibility_score"] - left["responsibility_score"]
        for left, right in pairs
    ]
    thresholds = campaign["thresholds"]
    agent_gain = fmean(agent_deltas)
    responsibility_gain = fmean(responsibility_deltas)
    gate = (
        agent_gain >= thresholds["agent_gain"]
        and responsibility_gain >= thresholds["responsibility_gain"]
        and all(delta > 0 for delta in agent_deltas)
        and all(delta > 0 for delta in responsibility_deltas)
    )
    return {
        "pair_count": len(pairs),
        "agent_gain": agent_gain,
        "responsibility_gain": responsibility_gain,
        "all_pairs_improve_agent": all(delta > 0 for delta in agent_deltas),
        "all_pairs_improve_responsibility": all(delta > 0 for delta in responsibility_deltas),
        "double_causal_gate": gate,
    }
