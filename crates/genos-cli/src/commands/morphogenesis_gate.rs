//! Evidence-gated bridge from the Node control plane to the Rust morphogenesis kernel.

use genos_orchestrator::kernel_governance::{GovernanceDecision, GovernanceInput, GovernancePlane};
use genos_orchestrator::kernel_morphogenesis::{MorphogenesisPlan, MorphogenesisPlanner, PlanInput};
use genos_orchestrator::kernel_resolvers::{Proposal, ProposalSet};
use genos_orchestrator::kernel_resolvers::{resolve_all, ResolverInput};
use genos_orchestrator::kernel_diagnosis::{Diagnosis, FailureType};
use genos_orchestrator::kernel_state::OrchestratorState;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use super::morphogenesis_authority::{self, Envelope, Expected, Verified};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: u8,
    current_topology: String,
    mission_id: Option<String>,
    variant_id: Option<String>,
    snapshot_sha256: Option<String>,
    graph_id: Option<String>,
    graph_version: Option<u64>,
    reason: String,
    proposals: Vec<Proposal>,
    transition_plan_sha256: Option<String>,
    transition_snapshot_id: Option<String>,
    transition_snapshot_sha256: Option<String>,
    risk_millis: Option<u16>,
    degraded_mode: Option<bool>,
    transition_authority: Option<Envelope>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProposeRequest {
    schema_version: u8,
    mission_id: String,
    snapshot_sha256: String,
    signal: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProposeResponse {
    schema_version: u8,
    request_sha256: String,
    proposals: Vec<Proposal>,
    committed: bool,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    authority: Option<Verified>,
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
    validate_snapshot_binding(request)?;
    validate_proposals(request)?;
    validate_transition_binding(request)?;
    Ok(())
}

fn validate_transition_binding(request: &Request) -> Result<(), String> {
    let fields = [request.transition_plan_sha256.is_some(), request.transition_snapshot_id.is_some(),
        request.transition_snapshot_sha256.is_some(), request.risk_millis.is_some(),
        request.degraded_mode.is_some(), request.transition_authority.is_some()];
    if fields.iter().any(|present| *present) && fields.iter().any(|present| !present) {
        return Err("incomplete authenticated transition binding".into());
    }
    if request.transition_plan_sha256.as_ref().is_some_and(|value| !is_sha256(value))
        || request.transition_snapshot_sha256.as_ref().is_some_and(|value| !is_sha256(value))
        || request.transition_snapshot_id.as_ref().is_some_and(|value| value.trim().is_empty())
        || request.risk_millis.is_some_and(|value| value > 1_000) {
        return Err("invalid authenticated transition binding".into());
    }
    if request.transition_authority.is_some()
        && request.mission_id.as_ref().is_none_or(|value| value.trim().is_empty()) {
        return Err("authenticated transition requires a mission identifier".into());
    }
    Ok(())
}

fn validate_snapshot_binding(request: &Request) -> Result<(), String> {
    let fields = [request.snapshot_sha256.is_some(), request.graph_id.is_some(),
        request.graph_version.is_some()];
    if fields.iter().any(|present| *present) && fields.iter().any(|present| !present) {
        return Err("incomplete graph snapshot binding".into());
    }
    if request.snapshot_sha256.as_ref().is_some_and(|value| !is_sha256(value))
        || request.graph_id.as_ref().is_some_and(|value| value.trim().is_empty())
        || request.graph_version.is_some_and(|value| value == 0) {
        return Err("invalid graph snapshot binding".into());
    }
    Ok(())
}

fn validate_proposals(request: &Request) -> Result<(), String> {
    if request.proposals.len() > 64 {
        return Err("too many morphogenesis proposals".into());
    }
    if request.proposals.iter().any(|proposal| !valid_proposal(proposal)) {
        return Err("invalid morphogenesis proposal".into());
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_proposal(proposal: &Proposal) -> bool {
    let allowed = ["change_topology", "spawn_verifier", "spawn_probe", "isolate_worker",
        "change_recipe", "change_strategy", "require_approval"];
    allowed.contains(&proposal.action.as_str())
        && !proposal.target.trim().is_empty()
        && proposal.gain.is_finite() && proposal.gain >= 0.0
        && proposal.cost.is_finite() && proposal.cost >= 0.0
}

fn hysteresis_path() -> std::path::PathBuf {
    if let Ok(path) = std::env::var("GENOS_MORPHOGENESIS_HYSTERESIS_PATH") {
        if !path.trim().is_empty() {
            return std::path::PathBuf::from(path);
        }
    }
    std::env::temp_dir().join("genos-morphogenesis-hysteresis.json")
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct HysteresisState {
    last_change_unix_ms: Option<u64>,
    budget_left: f64,
}

fn load_hysteresis() -> HysteresisState {
    let path = hysteresis_path();
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    if raw.trim().is_empty() {
        return HysteresisState { last_change_unix_ms: None, budget_left: 1.0 };
    }
    let parsed: Result<HysteresisState, _> = serde_json::from_str(&raw);
    match parsed {
        Ok(state) if state.budget_left.is_finite()
            && state.budget_left >= 0.0 && state.budget_left <= 1.0 => state,
        _ => HysteresisState { last_change_unix_ms: None, budget_left: 1.0 },
    }
}

fn store_hysteresis(state: &HysteresisState) {
    let path = hysteresis_path();
    if let Ok(raw) = serde_json::to_string(state) {
        let tmp = path.with_extension("tmp");
        if std::fs::write(&tmp, raw).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

fn planner_with_hysteresis() -> (MorphogenesisPlanner, HysteresisState) {
    use std::time::{Duration, Instant};
    let state = load_hysteresis();
    let mut planner = MorphogenesisPlanner::default();
    planner.budget_left = state.budget_left;
    if let Some(last_ms) = state.last_change_unix_ms {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(last_ms);
        let elapsed_ms = now_ms.saturating_sub(last_ms);
        let elapsed = Duration::from_millis(elapsed_ms);
        if elapsed < planner.policy.cooldown {
            let remaining = planner.policy.cooldown.saturating_sub(elapsed);
            planner.last_change = Instant::now().checked_sub(remaining);
        }
    }
    (planner, state)
}

fn persist_hysteresis_after_plan(planner: &MorphogenesisPlanner, loaded: &HysteresisState, plan: &MorphogenesisPlan) {
    if !plan.has_meaningful_change() {
        return;
    }
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_else(|_| loaded.last_change_unix_ms.unwrap_or(0));
    store_hysteresis(&HysteresisState { last_change_unix_ms: Some(now_ms),
        budget_left: planner.budget_left });
}

fn adjudicate(payload: &str) -> Result<Response, String> {
    if payload.len() > 65536 {
        return Err("morphogenesis adjudication payload exceeds 64 KiB".into());
    }
    let mut request: Request = serde_json::from_str(payload)
        .map_err(|error| format!("invalid morphogenesis adjudication JSON: {error}"))?;
    validate(&request)?;
    let verified = verify_transition_authority(&mut request)?;
    let proposals = ProposalSet { items: request.proposals };
    let (mut planner, hysteresis) = planner_with_hysteresis();
    let plan = planner.plan(&PlanInput {
        proposals: &proposals,
        current_topology: &request.current_topology,
        reason: &request.reason,
    });
    persist_hysteresis_after_plan(&planner, &hysteresis, &plan);
    let authority = if verified.is_some() { "orchestrator_principal" } else { "post_mission_read_only" };
    let governance = GovernancePlane::new().validate(&GovernanceInput {
        plan: &plan,
        authority,
        risk_level: f64::from(request.risk_millis.unwrap_or(0)) / 1_000.0,
        degraded_mode: request.degraded_mode.unwrap_or(false),
    });
    let authorized = verified.is_some() && governance.allowed && !plan.decision_no_change;
    let decision = if plan.decision_no_change { "NO_CHANGE" }
        else if authorized { "APPLY" } else { "REJECTED" };
    Ok(Response {
        schema_version: 1,
        request_sha256: format!("{:x}", Sha256::digest(payload.as_bytes())),
        decision,
        commit_authorized: authorized,
        committed: false,
        plan,
        governance,
        authority: verified,
    })
}

fn verify_transition_authority(request: &mut Request) -> Result<Option<Verified>, String> {
    let Some(envelope) = request.transition_authority.take() else { return Ok(None); };
    let expected = Expected {
        mission_id: request.mission_id.as_deref().unwrap_or_default(),
        plan_sha256: request.transition_plan_sha256.as_deref().unwrap_or_default(),
        snapshot_id: request.transition_snapshot_id.as_deref().unwrap_or_default(),
        snapshot_sha256: request.transition_snapshot_sha256.as_deref().unwrap_or_default(),
        risk_millis: request.risk_millis.unwrap_or(0),
        degraded_mode: request.degraded_mode.unwrap_or(false),
    };
    morphogenesis_authority::verify(envelope, expected).map(Some)
}

pub fn execute(payload: &str) -> Result<(), String> {
    let result = adjudicate(payload)?;
    let json = serde_json::to_string(&result).map_err(|error| error.to_string())?;
    println!("{json}");
    Ok(())
}

fn resolve_proposals(payload: &str) -> Result<ProposeResponse, String> {
    if payload.len() > 65536 {
        return Err("morphogenesis proposal payload exceeds 64 KiB".into());
    }
    let request: ProposeRequest = serde_json::from_str(payload)
        .map_err(|error| format!("invalid morphogenesis proposal JSON: {error}"))?;
    if request.schema_version != 1 || request.mission_id.trim().is_empty()
        || !is_sha256(&request.snapshot_sha256) {
        return Err("invalid morphogenesis proposal binding".into());
    }
    let failure = match request.signal.as_str() {
        "evidence_gap" => FailureType::Epistemic,
        "none" => FailureType::None,
        _ => return Err("unsupported post-mission diagnostic signal".into()),
    };
    let state = OrchestratorState::new(&request.mission_id);
    let diagnosis = Diagnosis {
        failure,
        confidence: if failure == FailureType::None { 1.0 } else { 0.7 },
        detail: request.signal,
    };
    let proposals = resolve_all(&ResolverInput { state: &state, diagnosis: &diagnosis }).items;
    Ok(ProposeResponse {
        schema_version: 1,
        request_sha256: format!("{:x}", Sha256::digest(payload.as_bytes())),
        proposals,
        committed: false,
    })
}

pub fn propose(payload: &str) -> Result<(), String> {
    let result = resolve_proposals(payload)?;
    let json = serde_json::to_string(&result).map_err(|error| error.to_string())?;
    println!("{json}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    static HYSTERESIS_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn clear_hysteresis_state() {
        let _ = std::fs::remove_file(hysteresis_path());
    }

    #[test]
    fn zero_evidence_yields_no_change() {
        let _guard = HYSTERESIS_TEST_LOCK.lock().unwrap();
        clear_hysteresis_state();
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"post-mission","proposals":[{"resolver":"post_mission","action":"change_topology","target":"rhizome","gain":0.0,"cost":0.0}]}"#;
        let output = adjudicate(input).unwrap();
        assert_eq!(output.decision, "NO_CHANGE");
        assert!(output.plan.decision_no_change);
        assert!(!output.commit_authorized);
        assert!(!output.committed);
    }

    #[test]
    fn meaningful_change_is_refused_without_principal() {
        let _guard = HYSTERESIS_TEST_LOCK.lock().unwrap();
        clear_hysteresis_state();
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"test","proposals":[{"resolver":"test","action":"change_topology","target":"rhizome","gain":0.5,"cost":0.1}]}"#;
        let output = adjudicate(input).unwrap();
        assert_eq!(output.decision, "REJECTED");
        assert!(!output.governance.allowed);
        assert!(output.plan.has_meaningful_change());
        clear_hysteresis_state();
    }

    #[test]
    fn successive_transitions_observe_cooldown_and_budget() {
        let _guard = HYSTERESIS_TEST_LOCK.lock().unwrap();
        clear_hysteresis_state();
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"test","proposals":[{"resolver":"test","action":"change_topology","target":"rhizome","gain":0.5,"cost":0.1}]}"#;
        let first = adjudicate(input).unwrap();
        assert!(first.plan.has_meaningful_change());
        let second = adjudicate(input).unwrap();
        assert_eq!(second.decision, "NO_CHANGE");
        assert!(second.plan.decision_no_change);
        clear_hysteresis_state();
    }

    #[test]
    fn malformed_or_unsupported_inputs_fail_closed() {
        assert!(adjudicate("{}").is_err());
        let input = r#"{"schemaVersion":1,"currentTopology":"trinity","reason":"test","proposals":[{"resolver":"test","action":"unknown","target":"rhizome","gain":0.5,"cost":0.1}]}"#;
        assert!(adjudicate(input).is_err());
    }

    #[test]
    fn evidence_gap_resolver_emits_a_real_proposal() {
        let input = format!(r#"{{"schemaVersion":1,"missionId":"mission-1","snapshotSha256":"{}","signal":"evidence_gap"}}"#, "a".repeat(64));
        let output = resolve_proposals(&input).unwrap();
        assert!(output.proposals.iter().any(|item| item.action == "spawn_verifier"));
        assert!(!output.committed);
    }
}
