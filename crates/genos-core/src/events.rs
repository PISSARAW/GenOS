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
    ProcessStarted,
    ProcessStdout,
    ProcessCompleted,
    MemoryCreated,
    MemoryUpdated,
    SnapshotCreated,
    ForkCreated,
    ForkStarted,
    ForkCompleted,
    ForkFailed,
    EvaluationCreated,
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

/// Bind every event emitted by one logical action to the same correlation id.
pub fn correlate_events(events: &mut [AgentEvent], correlation_id: CorrelationId) {
    for event in events {
        event.correlation_id = Some(correlation_id.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;

    fn event(event_type: AgentEventType, sequence: u64) -> AgentEvent {
        AgentEvent {
            event_id: EventId::new(),
            agent_id: AgentId::new(),
            branch_id: Some(BranchId::new()),
            sequence,
            timestamp: Utc::now(),
            event_type,
            payload: json!({ "action": "run tests" }),
            causation_id: None,
            correlation_id: None,
        }
    }

    #[test]
    fn run_tests_action_events_share_a_correlation_id() {
        let correlation_id = CorrelationId::new();
        let mut events = vec![
            event(AgentEventType::ToolRequested, 1),
            event(AgentEventType::ProcessStarted, 2),
            event(AgentEventType::ProcessStdout, 3),
            event(AgentEventType::ProcessCompleted, 4),
            event(AgentEventType::EvaluationCreated, 5),
        ];

        correlate_events(&mut events, correlation_id.clone());
        assert!(events.iter().all(|event| event.correlation_id == Some(correlation_id.clone())));
    }
}
