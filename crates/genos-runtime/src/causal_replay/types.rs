use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub type CausalState = BTreeMap<String, Value>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalCheckpoint {
    pub agent_ref: String,
    pub at: DateTime<Utc>,
    pub state: CausalState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CausalEventKind {
    Decision,
    Observation,
    Action,
    Outcome,
    External,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PredicateOperation {
    Equals,
    NotEquals,
    GreaterThan,
    GreaterOrEqual,
    LessThan,
    LessOrEqual,
    Exists,
    Missing,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StatePredicate {
    pub key: String,
    pub operation: PredicateOperation,
    #[serde(default)]
    pub value: Value,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectOperation {
    Set,
    Add,
    Multiply,
    Remove,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalStateEffect {
    pub key: String,
    pub operation: EffectOperation,
    #[serde(default)]
    pub value: Value,
    #[serde(default)]
    pub when: Vec<StatePredicate>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalTimelineEvent {
    pub event_id: String,
    pub occurred_at: DateTime<Utc>,
    pub kind: CausalEventKind,
    pub description: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub preconditions: Vec<StatePredicate>,
    #[serde(default)]
    pub effects: Vec<CausalStateEffect>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DecisionIntervention {
    pub target_event_id: String,
    pub replacement: CausalTimelineEvent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplayEventStatus {
    Applied,
    Replaced,
    Skipped,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StateChange {
    pub key: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReplayedCausalEvent {
    pub source_event_id: String,
    pub effective_event_id: String,
    pub occurred_at: DateTime<Utc>,
    pub status: ReplayEventStatus,
    pub description: String,
    pub state_changes: Vec<StateChange>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalTimelineResult {
    pub label: String,
    pub final_state: CausalState,
    pub events: Vec<ReplayedCausalEvent>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalStateDelta {
    pub key: String,
    pub reality: Option<Value>,
    pub counterfactual: Option<Value>,
    pub numeric_delta: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalReplayComparison {
    pub decision_changed_from: String,
    pub decision_changed_to: String,
    pub state_deltas: Vec<CausalStateDelta>,
    pub direct_effects: Vec<String>,
    pub downstream_effects: Vec<String>,
    pub incompatible_events: Vec<String>,
    pub common_replayed_events: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PersonalCausalReplayReport {
    pub checkpoint: CausalCheckpoint,
    pub history_end: DateTime<Utc>,
    pub reality: CausalTimelineResult,
    pub counterfactual: CausalTimelineResult,
    pub comparison: CausalReplayComparison,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PersonalCausalReplayManifest {
    pub name: String,
    pub checkpoint: CausalCheckpoint,
    pub history_end: DateTime<Utc>,
    pub events: Vec<CausalTimelineEvent>,
    pub intervention: DecisionIntervention,
}
