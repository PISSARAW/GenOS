use super::AgentSnapshot;
use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{EventId, SnapshotId};
use chrono::{DateTime, Utc};
use serde_json::json;

/// What a [`checkpoint_snapshot`] call produced: the new snapshot on the
/// same branch with a fresh `snapshot_id`, plus the audit event the call
/// stamped. Mirrors [`super::RestoreWrite`] so a future unified event pipeline
/// treats every mutation uniformly.
#[derive(Clone, Debug)]
pub struct CheckpointWrite {
    /// The new snapshot: fresh `snapshot_id`, same `agent_id` and
    /// `branch_id` as `current`. Logical state copied verbatim — a
    /// checkpoint does not rewrite any `LOGICAL_STATE_FIELDS`.
    pub snapshot: AgentSnapshot,
    /// `SnapshotCreated` event bound to `current`'s branch, sequence
    /// `N + 1` where `N` was the cursor sequence before the checkpoint.
    /// Payload references the prior snapshot id so a replay can
    /// reconstruct the edge.
    pub event: AgentEvent,
    /// The prior snapshot id the new one was forked from — duplicated in
    /// `event.payload["parent_snapshot_id"]` for downstream readers.
    pub parent_snapshot_id: SnapshotId,
}

/// Mint a fresh `snapshot_id` carrying the current logical state on the
/// same branch.
pub fn checkpoint_snapshot(current: &AgentSnapshot) -> CheckpointWrite {
    checkpoint_snapshot_at(current, Utc::now())
}

/// [`checkpoint_snapshot`] with an explicit creation timestamp, for
/// deterministic tests.
pub fn checkpoint_snapshot_at(
    current: &AgentSnapshot,
    timestamp: DateTime<Utc>,
) -> CheckpointWrite {
    let previous_sequence = current.state.event_cursor.sequence;
    let sequence = previous_sequence + 1;

    let mut new_state = current.state.clone();
    new_state.event_cursor.branch_id = current.branch_id.clone();
    new_state.event_cursor.last_event_id = None;

    let new_snapshot = AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id: current.agent_id.clone(),
        branch_id: current.branch_id.clone(),
        branch_metadata: current.branch_metadata.clone(),
        genome: current.genome.clone(),
        state: new_state,
        world_id: current.world_id.clone(),
        tool_state: current.tool_state.clone(),
        runtime_metadata: current.runtime_metadata.clone(),
        created_at: timestamp,
    };

    let payload = json!({
        "kind": "snapshot_created",
        "parent_snapshot_id": current.snapshot_id.0,
        "child_snapshot_id": new_snapshot.snapshot_id.0,
        "previous_sequence": previous_sequence,
    });
    let event = AgentEvent {
        event_id: EventId::new(),
        agent_id: current.agent_id.clone(),
        branch_id: Some(current.branch_id.clone()),
        sequence,
        timestamp,
        event_type: AgentEventType::SnapshotCreated,
        payload,
        causation_id: current.state.event_cursor.last_event_id.clone(),
        correlation_id: None,
    };

    let mut new_snapshot = new_snapshot;
    new_snapshot.state.event_cursor.sequence = sequence;
    new_snapshot.state.event_cursor.last_event_id = Some(event.event_id.clone());

    CheckpointWrite {
        snapshot: new_snapshot,
        event,
        parent_snapshot_id: current.snapshot_id.clone(),
    }
}
