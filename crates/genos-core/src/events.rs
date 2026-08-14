use crate::ids::{AgentId, BranchId, CorrelationId, EventId};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentEventType {
    AgentCreated,
    AgentStarted,
    AgentStopped,
    ModelRequested,
    ModelResponded,
    ToolRequested,
    ToolCompleted,
    ToolFailed,
    MemoryCreated,
    MemoryUpdated,
    SnapshotCreated,
    ForkCreated,
    ForkStarted,
    ForkCompleted,
    ForkFailed,
    EvaluationStarted,
    EvaluationCompleted,
    BranchSelected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentEvent {
    pub event_id: EventId,
    pub agent_id: AgentId,
    pub branch_id: Option<BranchId>,
    pub sequence: u64,
    pub timestamp: DateTime<Utc>,
    pub event_type: AgentEventType,
    pub payload: Value,
    pub causation_id: Option<EventId>,
    pub correlation_id: Option<CorrelationId>,
}
