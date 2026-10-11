//! Read-only bridge from the Node control plane to the Rust morphogenesis kernel.

use genos_orchestrator::kernel_governance::{GovernanceDecision, GovernanceInput, GovernancePlane};
use genos_orchestrator::kernel_morphogenesis::{MorphogenesisPlan, MorphogenesisPlanner, PlanInput};
use genos_orchestrator::kernel_resolvers::{Proposal, ProposalSet};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: u8,
    current_topology: String,
    mission_id: Option<String>,
    variant_id: Option<String>,
    reason: String,
    proposals: Vec<Proposal>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    schema_version: u8,
    request_sha256: String,
    decision: &'static str,
    commit_authorized: bool,
    committed: bool,
    plan: MorphogenesisPlan,
    governance: GovernanceDecision,
}

fn validate(request: &Request) -> Result<(), String> {
    if request.schema_version != 1 {
        return Err("unsupported morphogenesis adjudication schema".into());
    }
    if request.current_topology.trim().is_empty() || request.reason.trim().is_empty() {
        return Err("current topology and reason are required".into());
    }
    if request.mission_id.as_ref().is_some_and(|value| value.trim().is_empty())
        || request.variant_id.as_ref().is_some_and(|value| value.trim().is_empty()) {
        return Err("mission and variant identifiers cannot be empty".into());
    }
    if request.proposals.len() > 64 {
        return Err("too many morphogenesis proposals".into());
    }
    if request.proposals.iter().any(|proposal| !valid_proposal(proposal)) {
        return Err("invalid morphogenesis proposal".into());
    }
    Ok(())
}

fn valid_proposal(proposal: &Proposal) -> bool {
    let allowed = ["change_topology", "spawn_verifier", "spawn_probe", "isolate_worker",
        "change_recipe", "change_strategy", "require_approval"];
    allowed.contains(&proposal.action.as_str())
        && !proposal.target.trim().is_empty()
        && proposal.gain.is_finite() && proposal.gain >= 0.0
        && proposal.cost.is_finite() && proposal.cost >= 0.0
}

fn adjudicate(payload: &str) -> Result<Response, String> {
    if payload.len() > 65536 {
        return Err("morphogenesis adjudication payload exceeds 64 KiB".into());
    }
    let request: Request = serde_json::from_str(payload)
        .map_err(|error| format!("invalid morphogenesis adjudication JSON: {error}"))?;
    validate(&request)?;
    let proposals = ProposalSet { items: request.proposals };
    let mut planner = MorphogenesisPlanner::default();
    let plan = planner.plan(&PlanInput {
        proposals: &proposals,
        current_topology: &request.current_topology,
        reason: &request.reason,
    });
    // The public post-mission caller has no authenticated principal or transition lease.
    let governance = GovernancePlane::new().validate(&GovernanceInput {
        plan: &plan,
        authority: "post_mission_read_only",
        risk_level: 0.0,
        degraded_mode: false,
    });
    let decision = if plan.decision_no_change { "NO_CHANGE" } else { "REJECTED" };
    Ok(Response {
        schema_version: 1,
        request_sha256: format!("{:x}", Sha256::digest(payload.as_bytes())),
        decision,
        commit_authorized: false,
        committed: false,
        plan,
        governance,
    })
}

pub fn execute(payload: &str) -> Result<(), String> {
    let result = adjudicate(payload)?;
    let json = serde_json::to_string(&result).map_err(|error| error.to_string())?;
    println!("{json}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_evidence_yields_no_change() {
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"post-mission","proposals":[{"resolver":"post_mission","action":"change_topology","target":"rhizome","gain":0.0,"cost":0.0}]}"#;
        let output = adjudicate(input).unwrap();
        assert_eq!(output.decision, "NO_CHANGE");
        assert!(output.plan.decision_no_change);
        assert!(!output.commit_authorized);
        assert!(!output.committed);
    }

    #[test]
    fn meaningful_change_is_refused_without_principal() {
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"test","proposals":[{"resolver":"test","action":"change_topology","target":"rhizome","gain":0.5,"cost":0.1}]}"#;
        let output = adjudicate(input).unwrap();
        assert_eq!(output.decision, "REJECTED");
        assert!(!output.governance.allowed);
        assert!(output.plan.has_meaningful_change());
    }

    #[test]
    fn malformed_or_unsupported_inputs_fail_closed() {
        assert!(adjudicate("{}").is_err());
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"test","proposals":[{"resolver":"test","action":"unknown","target":"rhizome","gain":0.5,"cost":0.1}]}"#;
        assert!(adjudicate(input).is_err());
    }
}
