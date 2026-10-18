use super::morphogenesis_authority::Verified;
use genos_orchestrator::kernel_morphogenesis::MorphogenesisPlanner;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const STATE_SCHEMA: &str = "genos.morphogenesis-hysteresis-state/v1";
const TRANSITION_SCHEMA: &str = "genos.morphogenesis-hysteresis-transition/v1";
const CALIBRATION_SCHEMA: &str = "genos.morphogenesis-hysteresis-calibration/v1";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CalibrationPolicy {
    schema: String,
    minimum_gain: f64,
    cooldown_ms: u64,
    transition_budget: f64,
    sample_count: u64,
    evidence_digest: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HysteresisState {
    schema: String,
    organization_id: String,
    project_id: String,
    mission_id: String,
    pub version: u64,
    budget_left: f64,
    last_commit_unix_ms: Option<u64>,
    calibration_policy: Option<CalibrationPolicy>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HysteresisTransition {
    schema: &'static str,
    base_version: u64,
    next_version: u64,
    budget_left: f64,
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is invalid: {error}"))
}

fn validate_state(state: &HysteresisState) -> Result<(), String> {
    if state.schema != STATE_SCHEMA
        || !state.budget_left.is_finite()
        || !(0.0..=1.0).contains(&state.budget_left)
        || state.version == u64::MAX
        || state.version == 0 && state.last_commit_unix_ms.is_some()
        || state.version > 0 && state.last_commit_unix_ms.is_none()
    {
        return Err("invalid durable morphogenesis hysteresis state".into());
    }
    if state
        .calibration_policy
        .as_ref()
        .is_some_and(|policy| !valid_calibration(policy))
    {
        return Err("invalid morphogenesis hysteresis calibration".into());
    }
    Ok(())
}

fn valid_calibration(policy: &CalibrationPolicy) -> bool {
    policy.schema == CALIBRATION_SCHEMA
        && policy.minimum_gain.is_finite()
        && (0.0..=1.0).contains(&policy.minimum_gain)
        && policy.transition_budget.is_finite()
        && (0.0..=1.0).contains(&policy.transition_budget)
        && policy.sample_count > 0
        && policy.evidence_digest.len() == 71
        && policy.evidence_digest.starts_with("sha256:")
        && policy.evidence_digest[7..]
            .chars()
            .all(|value| value.is_ascii_hexdigit())
}

pub(crate) fn validate_scope(state: &HysteresisState, authority: &Verified) -> Result<(), String> {
    validate_state(state)?;
    if state.organization_id != authority.organization_id
        || state.project_id != authority.project_id
        || state.mission_id != authority.mission_id
    {
        return Err("morphogenesis hysteresis scope does not match authority".into());
    }
    Ok(())
}

pub(crate) fn planner(state: Option<&HysteresisState>) -> Result<MorphogenesisPlanner, String> {
    let mut planner = MorphogenesisPlanner::default();
    let Some(state) = state else {
        return Ok(planner);
    };
    validate_state(state)?;
    planner.budget_left = state.budget_left;
    if let Some(policy) = &state.calibration_policy {
        planner.policy.minimum_gain = policy.minimum_gain;
        planner.policy.cooldown = Duration::from_millis(policy.cooldown_ms);
        planner.policy.transition_budget = policy.transition_budget;
        planner.budget_left = planner.budget_left.min(policy.transition_budget);
    }
    if let Some(last_ms) = state.last_commit_unix_ms {
        let elapsed = Duration::from_millis(now_ms()?.saturating_sub(last_ms));
        if elapsed < planner.policy.cooldown {
            planner.last_change = Instant::now().checked_sub(elapsed);
        }
    }
    Ok(planner)
}

pub(crate) fn prepare(
    state: Option<&HysteresisState>,
    planner: &MorphogenesisPlanner,
    authorized: bool,
) -> Option<HysteresisTransition> {
    let state = state?;
    if !authorized {
        return None;
    }
    Some(HysteresisTransition {
        schema: TRANSITION_SCHEMA,
        base_version: state.version,
        next_version: state.version + 1,
        budget_left: planner.budget_left,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(version: u64, last_commit_unix_ms: Option<u64>) -> HysteresisState {
        HysteresisState {
            schema: STATE_SCHEMA.into(),
            organization_id: "org".into(),
            project_id: "project".into(),
            mission_id: "mission".into(),
            version,
            budget_left: 0.8,
            last_commit_unix_ms,
            calibration_policy: None,
        }
    }

    fn authority() -> Verified {
        Verified {
            key_id: "key".into(),
            principal_id: "principal".into(),
            organization_id: "org".into(),
            project_id: "project".into(),
            mission_id: "mission".into(),
            snapshot_id: "snapshot".into(),
            snapshot_sha256: "a".repeat(64),
            plan_sha256: "b".repeat(64),
            expires_at_unix_ms: u64::MAX,
        }
    }

    #[test]
    fn restores_scoped_budget_without_global_file() {
        let value = state(3, Some(now_ms().unwrap().saturating_sub(60_000)));
        let planner = planner(Some(&value)).unwrap();
        assert_eq!(planner.budget_left, 0.8);
        assert!(planner.last_change.is_none());
    }

    #[test]
    fn recent_commit_restores_cooldown() {
        let value = state(1, Some(now_ms().unwrap()));
        assert!(planner(Some(&value)).unwrap().last_change.is_some());
    }

    #[test]
    fn applies_verified_budget_calibration() {
        let mut value = state(1, Some(now_ms().unwrap().saturating_sub(20_000)));
        value.calibration_policy = Some(CalibrationPolicy {
            schema: CALIBRATION_SCHEMA.into(),
            minimum_gain: 0.2,
            cooldown_ms: 10_000,
            transition_budget: 0.6,
            sample_count: 40,
            evidence_digest: format!("sha256:{}", "a".repeat(64)),
        });
        let planner = planner(Some(&value)).unwrap();
        assert_eq!(planner.policy.minimum_gain, 0.2);
        assert_eq!(planner.policy.cooldown, Duration::from_secs(10));
        assert_eq!(planner.budget_left, 0.6);
        assert!(planner.last_change.is_none());
    }

    #[test]
    fn rejects_cross_mission_state() {
        let mut value = state(1, Some(now_ms().unwrap()));
        value.mission_id = "other-mission".into();
        assert!(validate_scope(&value, &authority()).is_err());
    }
}
