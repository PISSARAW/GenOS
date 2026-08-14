use crate::ids::{AgentId, BranchId, SnapshotId, WorldId};
use crate::{AgentGenome, AgentState};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Snapshot fields that carry logical state, i.e. everything a fork inherits
/// unchanged from its parent. Identity fields (`snapshot_id`, `agent_id`,
/// `branch_id`, `state.event_cursor.branch_id`) and `created_at` are excluded on
/// purpose: two sibling forks must differ there.
pub const LOGICAL_STATE_FIELDS: [&str; 15] = [
    "genome",
    "state.genome",
    "state.working_memory",
    "state.semantic_memory",
    "state.episodic_memory",
    "state.beliefs",
    "state.active_goals",
    "state.world_id",
    "state.event_cursor.sequence",
    "state.event_cursor.last_event_id",
    "state.execution",
    "state.artifact_refs",
    "world_id",
    "tool_state",
    "runtime_metadata",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeMetadata {
    pub runtime_version: String,
    pub budget_steps_remaining: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolState {
    pub active_tools: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentSnapshot {
    pub snapshot_id: SnapshotId,
    pub agent_id: AgentId,
    pub branch_id: BranchId,
    pub genome: AgentGenome,
    pub state: AgentState,
    pub world_id: WorldId,
    pub tool_state: ToolState,
    pub runtime_metadata: RuntimeMetadata,
    pub created_at: DateTime<Utc>,
}

/// Derive a counterfactual fork from `parent` without invoking a model.
///
/// The fork inherits every field listed in [`LOGICAL_STATE_FIELDS`] and receives
/// a fresh `snapshot_id`, `agent_id` and `branch_id`. The event cursor is rebound
/// to the new branch and its `last_event_id` cleared, so the fork starts on an
/// empty event stream while keeping the parent's `sequence` as its lineage
/// watermark: the first event of the fork belongs at `sequence + 1`.
pub fn fork_snapshot(parent: &AgentSnapshot) -> AgentSnapshot {
    fork_snapshot_at(parent, Utc::now())
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

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{
        CognitionConfig, EpisodicMemory, EventCursor, ExecutionMetadata, GenomeId, GenomeRef,
        GenomeVersion, Goal, Identity, MemoryId, MemoryPolicy, ModelPolicy, SemanticMemory,
        ToolPolicy, WorkingMemory, WorkingMemoryItem,
    };

    /// Parent snapshot holding a single branch-local variable, for the
    /// divergence checks in [`crate::variables`].
    pub(crate) fn snapshot_with_variable(key: &str, value: &str) -> AgentSnapshot {
        let mut snapshot = parent_snapshot(0);
        snapshot.state.working_memory.items.push(WorkingMemoryItem {
            key: key.to_string(),
            value: value.to_string(),
        });
        snapshot
    }

    fn parent_snapshot(sequence: u64) -> AgentSnapshot {
        let genome_id = GenomeId::new();
        let branch_id = BranchId::new();
        let world_id = WorldId::new();

        AgentSnapshot {
            snapshot_id: SnapshotId::new(),
            agent_id: AgentId::new(),
            branch_id: branch_id.clone(),
            genome: AgentGenome {
                id: genome_id.clone(),
                version: GenomeVersion("0.1.0".to_string()),
                identity: Identity {
                    name: "clone-no-llm".to_string(),
                    role: "tester".to_string(),
                },
                cognition: CognitionConfig {
                    exploration: 0.7,
                    verification_threshold: 0.8,
                    planning_depth: 6,
                },
                objectives: vec![],
                policies: vec![],
                capabilities: vec![],
                memory_policy: MemoryPolicy {
                    working_max_items: 100,
                    episodic_enabled: true,
                    semantic_enabled: true,
                },
                model_policy: ModelPolicy {
                    strategy: "provider-agnostic".to_string(),
                    preferred_providers: vec![],
                    allow_local: true,
                },
                tool_policy: ToolPolicy {
                    permissions: vec![],
                },
            },
            state: AgentState {
                genome: GenomeRef {
                    genome_id,
                    version: "0.1.0".to_string(),
                },
                working_memory: WorkingMemory {
                    items: vec![WorkingMemoryItem {
                        key: "seed_note".to_string(),
                        value: "minimal-memory".to_string(),
                    }],
                },
                semantic_memory: SemanticMemory {
                    refs: vec![MemoryId("memory-minimal-1".to_string())],
                },
                episodic_memory: EpisodicMemory { refs: vec![] },
                beliefs: vec![],
                active_goals: vec![Goal {
                    key: "bootstrap".to_string(),
                    description: "Initialize first runtime step".to_string(),
                }],
                world_id: world_id.clone(),
                event_cursor: EventCursor {
                    branch_id,
                    sequence,
                    last_event_id: None,
                },
                execution: ExecutionMetadata {
                    step: 0,
                    last_model_provider: None,
                },
                artifact_refs: vec![],
            },
            world_id,
            tool_state: ToolState {
                active_tools: vec![],
            },
            runtime_metadata: RuntimeMetadata {
                runtime_version: "0.0.1".to_string(),
                budget_steps_remaining: 0,
            },
            created_at: Utc::now(),
        }
    }

    #[test]
    fn fork_keeps_logical_state_and_rebinds_identity() {
        let parent = parent_snapshot(0);
        let fork = fork_snapshot(&parent);

        let against_parent = compare_snapshots(&parent, &fork);
        assert!(against_parent.same_logical_state, "{against_parent:?}");
        assert!(against_parent.distinct_identity);

        assert_eq!(fork.branch_id, fork.state.event_cursor.branch_id);
        assert!(fork.state.event_cursor.last_event_id.is_none());
        assert_eq!(
            fork.state.event_cursor.sequence,
            parent.state.event_cursor.sequence
        );
    }

    #[test]
    fn sibling_forks_are_logically_identical_but_distinct() {
        let parent = parent_snapshot(0);
        let a1 = fork_snapshot(&parent);
        let a2 = fork_snapshot(&parent);

        let comparison = compare_snapshots(&a1, &a2);
        assert!(comparison.same_logical_state, "{comparison:?}");
        assert!(comparison.differing_fields.is_empty());
        assert_eq!(
            comparison.identical_fields.len(),
            LOGICAL_STATE_FIELDS.len()
        );
        assert!(comparison.distinct_identity);
        assert!(comparison.event_cursors_bound_to_own_branch);
    }

    #[test]
    fn compare_reports_the_field_that_diverged() {
        let parent = parent_snapshot(0);
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);
        a2.state.working_memory.items.push(WorkingMemoryItem {
            key: "drift".to_string(),
            value: "diverged".to_string(),
        });

        let comparison = compare_snapshots(&a1, &a2);
        assert!(!comparison.same_logical_state);
        assert_eq!(comparison.differing_fields, vec!["state.working_memory"]);
    }

    #[test]
    fn first_fork_event_continues_parent_lineage() {
        let parent = parent_snapshot(7);
        let fork = fork_snapshot(&parent);
        assert_eq!(fork_first_event_sequence(&fork), 8);
    }
}
