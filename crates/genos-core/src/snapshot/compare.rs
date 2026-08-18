use super::{AgentSnapshot, LOGICAL_STATE_FIELDS};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenomeStateComparison {
    pub left_genome_hash: String,
    pub right_genome_hash: String,
    pub same_genome: bool,
    pub same_phenotype_state: bool,
}

/// Compare the inherited genome separately from the branch-local state.
pub fn compare_genome_and_state(
    left: &AgentSnapshot,
    right: &AgentSnapshot,
) -> GenomeStateComparison {
    let left_genome_hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&left.genome).expect("genome must serialize"))
    );
    let right_genome_hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&right.genome).expect("genome must serialize"))
    );
    GenomeStateComparison {
        same_genome: left_genome_hash == right_genome_hash,
        same_phenotype_state: left.state == right.state,
        left_genome_hash,
        right_genome_hash,
    }
}

/// Outcome of comparing two snapshots as counterfactual siblings.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotComparison {
    /// True when every field in [`LOGICAL_STATE_FIELDS`] is equal.
    pub same_logical_state: bool,
    pub identical_fields: Vec<String>,
    pub differing_fields: Vec<String>,
    pub distinct_snapshot_id: bool,
    pub distinct_agent_id: bool,
    pub distinct_branch_id: bool,
    /// True when snapshot, agent and branch identifiers all differ.
    pub distinct_identity: bool,
    /// True when each snapshot's branch matches its own event cursor.
    pub event_cursors_bound_to_own_branch: bool,
}

/// Compare two snapshots along the counterfactual-fork contract: identical
/// logical state, distinct identity, each cursor bound to its own branch.
pub fn compare_snapshots(a: &AgentSnapshot, b: &AgentSnapshot) -> SnapshotComparison {
    let equalities = [
        a.genome == b.genome,
        a.state.genome == b.state.genome,
        a.state.working_memory == b.state.working_memory,
        a.state.semantic_memory == b.state.semantic_memory,
        a.state.episodic_memory == b.state.episodic_memory,
        a.state.memories == b.state.memories,
        a.state.beliefs == b.state.beliefs,
        a.state.active_goals == b.state.active_goals,
        a.state.world_id == b.state.world_id,
        a.state.event_cursor.sequence == b.state.event_cursor.sequence,
        a.state.event_cursor.last_event_id == b.state.event_cursor.last_event_id,
        a.state.execution == b.state.execution,
        a.state.artifact_refs == b.state.artifact_refs,
        a.world_id == b.world_id,
        a.tool_state == b.tool_state,
        a.runtime_metadata == b.runtime_metadata,
    ];

    let mut identical_fields = Vec::new();
    let mut differing_fields = Vec::new();
    for (field, equal) in LOGICAL_STATE_FIELDS.iter().zip(equalities.iter()) {
        if *equal {
            identical_fields.push((*field).to_string());
        } else {
            differing_fields.push((*field).to_string());
        }
    }

    let distinct_snapshot_id = a.snapshot_id != b.snapshot_id;
    let distinct_agent_id = a.agent_id != b.agent_id;
    let distinct_branch_id = a.branch_id != b.branch_id;

    SnapshotComparison {
        same_logical_state: differing_fields.is_empty(),
        identical_fields,
        differing_fields,
        distinct_snapshot_id,
        distinct_agent_id,
        distinct_branch_id,
        distinct_identity: distinct_snapshot_id && distinct_agent_id && distinct_branch_id,
        event_cursors_bound_to_own_branch: a.branch_id == a.state.event_cursor.branch_id
            && b.branch_id == b.state.event_cursor.branch_id,
    }
}
