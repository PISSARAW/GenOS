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
    WorldCreated,
    EvaluationStarted,
    EvaluationCompleted,
    BranchSelected,
    /// Logical state was rewound to a previously saved snapshot on the same
    /// branch. Payload carries `source_snapshot_id`, `restored_state_fields`
    /// (list of fields overwritten), and `event_cursor_sequence_before`. The
    /// event cursor advances past this event; the events emitted *before*
    /// restore remain on the branch stream — history is preserved by
    /// construction because the event store is append-only.
    Restored,
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
