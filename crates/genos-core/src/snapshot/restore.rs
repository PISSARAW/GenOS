use super::{AgentSnapshot, LOGICAL_STATE_FIELDS};
use crate::events::{AgentEvent, AgentEventType};
use crate::ids::EventId;
use chrono::{DateTime, Utc};
use serde_json::json;

/// What a [`restore_snapshot`] call did, plus the audit event it stamped on
/// the branch. Mirrors the `Write` shapes in [`crate::variables`],
/// [`crate::memories`], and [`crate::beliefs`] so a future unified event
/// pipeline can treat every mutation uniformly.
#[derive(Clone, Debug)]
pub struct RestoreWrite {
    /// The snapshot after the restore: same `snapshot_id`, `agent_id`,
    /// `branch_id` as `target`; logical state copied from `source`.
    pub snapshot: AgentSnapshot,
    /// `Restored` event bound to the target's branch, sequence `N + 1`
    /// where `N` was the cursor sequence before the restore. The payload
    /// references the source snapshot so a replay can reconstruct the edge.
    pub event: AgentEvent,
    /// Field names in [`LOGICAL_STATE_FIELDS`] that the restore actually
    /// overwrote (those that differed between target and source). Always a
    /// subset of `LOGICAL_STATE_FIELDS`; identity fields are never listed.
    pub restored_fields: Vec<String>,
}

/// Rewind a snapshot's logical state to match a previously saved snapshot.
pub fn restore_snapshot(target: &AgentSnapshot, source: &AgentSnapshot) -> RestoreWrite {
    restore_snapshot_at(target, source, Utc::now())
}

/// [`restore_snapshot`] with an explicit timestamp, for deterministic tests.
pub fn restore_snapshot_at(
    target: &AgentSnapshot,
    source: &AgentSnapshot,
    timestamp: DateTime<Utc>,
) -> RestoreWrite {
    assert_eq!(
        target.branch_id, source.branch_id,
        "restore requires target and source on the same branch ({} vs {})",
        target.branch_id.0, source.branch_id.0
    );

    let mut new_state = source.state.clone();
    new_state.event_cursor.branch_id = target.branch_id.clone();
    new_state.event_cursor.last_event_id = None;

    let new_snapshot = AgentSnapshot {
        snapshot_id: target.snapshot_id.clone(),
        agent_id: target.agent_id.clone(),
        branch_id: target.branch_id.clone(),
        branch_metadata: target.branch_metadata.clone(),
        genome: source.genome.clone(),
        state: new_state,
        world_id: source.world_id.clone(),
        tool_state: source.tool_state.clone(),
        runtime_metadata: target.runtime_metadata.clone(),
        created_at: timestamp,
    };

    let previous_sequence = target.state.event_cursor.sequence;
    let sequence = previous_sequence + 1;
    let payload = json!({
        "kind": "restore",
        "source_snapshot_id": source.snapshot_id.0,
        "target_snapshot_id": target.snapshot_id.0,
        "previous_sequence": previous_sequence,
    });
    let event = AgentEvent {
        event_id: EventId::new(),
        agent_id: target.agent_id.clone(),
        branch_id: Some(target.branch_id.clone()),
        sequence,
        timestamp,
        event_type: AgentEventType::Restored,
        payload,
        causation_id: target.state.event_cursor.last_event_id.clone(),
        correlation_id: None,
    };

    let mut new_snapshot = new_snapshot;
    new_snapshot.state.event_cursor.sequence = sequence;
    new_snapshot.state.event_cursor.last_event_id = Some(event.event_id.clone());

    let restored_fields = compute_restored_fields(target, source);

    RestoreWrite {
        snapshot: new_snapshot,
        event,
        restored_fields,
    }
}

/// Names of [`LOGICAL_STATE_FIELDS`] entries that actually differed between
/// `target` and `source` before the restore â€” i.e. the fields the restore
/// rewrote. Identity fields are excluded by construction (they're not in
/// `LOGICAL_STATE_FIELDS`).
fn compute_restored_fields(target: &AgentSnapshot, source: &AgentSnapshot) -> Vec<String> {
    let equalities = [
        target.genome == source.genome,
        target.state.genome == source.state.genome,
        target.state.working_memory == source.state.working_memory,
        target.state.semantic_memory == source.state.semantic_memory,
        target.state.episodic_memory == source.state.episodic_memory,
        target.state.memories == source.state.memories,
        target.state.beliefs == source.state.beliefs,
        target.state.active_goals == source.state.active_goals,
        target.state.world_id == source.state.world_id,
        target.state.event_cursor.sequence == source.state.event_cursor.sequence,
        target.state.event_cursor.last_event_id == source.state.event_cursor.last_event_id,
        target.state.execution == source.state.execution,
        target.state.artifact_refs == source.state.artifact_refs,
        target.world_id == source.world_id,
        target.tool_state == source.tool_state,
        target.runtime_metadata == source.runtime_metadata,
    ];
    LOGICAL_STATE_FIELDS
        .iter()
        .zip(equalities.iter())
        .filter_map(|(field, equal)| {
            if *equal {
                None
            } else {
                Some((*field).to_string())
            }
        })
        .collect()
}
