use super::{AgentSnapshot, BranchMetadata};
use crate::ids::{AgentId, BranchId, SnapshotId};
use chrono::{DateTime, Utc};

/// Derive a counterfactual fork from `parent` without invoking a model.
///
/// The fork inherits every field listed in [`super::LOGICAL_STATE_FIELDS`] and receives
/// a fresh `snapshot_id`, `agent_id` and `branch_id`. The event cursor is rebound
/// to the new branch and its `last_event_id` cleared, so the fork starts on an
/// empty event stream while keeping the parent's `sequence` as its lineage
/// watermark: the first event of the fork belongs at `sequence + 1`.
pub fn fork_snapshot(parent: &AgentSnapshot) -> AgentSnapshot {
    fork_snapshot_at(parent, Utc::now())
}

/// Fork with a human-readable branch label and experimental hypothesis.
pub fn fork_snapshot_with_hypothesis(
    parent: &AgentSnapshot,
    label: impl Into<String>,
    hypothesis: impl Into<String>,
) -> AgentSnapshot {
    let mut fork = fork_snapshot(parent);
    fork.branch_metadata = BranchMetadata {
        label: Some(label.into()),
        hypothesis: Some(hypothesis.into()),
    };
    fork
}

/// [`fork_snapshot`] with an explicit creation timestamp, for deterministic tests.
pub fn fork_snapshot_at(parent: &AgentSnapshot, created_at: DateTime<Utc>) -> AgentSnapshot {
    let branch_id = BranchId::new();

    let mut state = parent.state.clone();
    state.event_cursor.branch_id = branch_id.clone();
    state.event_cursor.last_event_id = None;

    AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id: AgentId::new(),
        branch_id,
        branch_metadata: parent.branch_metadata.clone(),
        genome: parent.genome.clone(),
        state,
        world_id: parent.world_id.clone(),
        tool_state: parent.tool_state.clone(),
        runtime_metadata: parent.runtime_metadata.clone(),
        created_at,
    }
}

/// Sequence number the first event of a fork must carry.
pub fn fork_first_event_sequence(snapshot: &AgentSnapshot) -> u64 {
    snapshot.state.event_cursor.sequence + 1
}
