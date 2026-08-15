use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{AgentId, BranchId, EventId, SnapshotId, WorldId};
use crate::{AgentGenome, AgentState};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

/// Snapshot fields that carry logical state, i.e. everything a fork inherits
/// unchanged from its parent. Identity fields (`snapshot_id`, `agent_id`,
/// `branch_id`, `state.event_cursor.branch_id`) and `created_at` are excluded on
/// purpose: two sibling forks must differ there.
pub const LOGICAL_STATE_FIELDS: [&str; 16] = [
    "genome",
    "state.genome",
    "state.working_memory",
    "state.semantic_memory",
    "state.episodic_memory",
    "state.memories",
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

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BranchMetadata {
    pub label: Option<String>,
    pub hypothesis: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentSnapshot {
    pub snapshot_id: SnapshotId,
    pub agent_id: AgentId,
    pub branch_id: BranchId,
    #[serde(default)]
    pub branch_metadata: BranchMetadata,
    pub genome: AgentGenome,
    pub state: AgentState,
    pub world_id: WorldId,
    pub tool_state: ToolState,
    pub runtime_metadata: RuntimeMetadata,
    pub created_at: DateTime<Utc>,
}

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
///
/// `target` keeps its identity (`snapshot_id`, `agent_id`, `branch_id`) —
/// restore is *not* a fork. Every entry in [`LOGICAL_STATE_FIELDS`] is
/// overwritten from `source`, so a `working_memory.counter = 50` that
/// diverged from `source`'s `counter = 10` reads as `counter = 10` after the
/// call.
///
/// History is preserved by construction: the event store is append-only,
/// the snapshot store is append-only, and the restore stamps a fresh
/// [`AgentEventType::Restored`] event on the branch so the audit trail
/// records both *what* was restored and *to what state*. The cursor advances
/// to that event's sequence — events emitted after the restore on the same
/// branch remain visible.
///
/// `source` must live on the same branch as `target`; a cross-branch restore
/// would break the lineage invariants (a snapshot's `branch_id` must equal
/// `state.event_cursor.branch_id`).
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

    // Build the new snapshot: keep target's identity, copy every logical
    // state field from source. The cursor keeps target's branch_id (which
    // equals source's branch_id, per the assert above); `last_event_id` is
    // reset to None because the upcoming Restored event is what the cursor
    // points at, and we haven't built it yet.
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

    // Build the audit event. Sequence = cursor.sequence + 1, where cursor
    // is *target*'s — the events emitted *before* this restore remain at
    // their original sequences, so a replay of the branch shows the whole
    // history up to and including the Restored event.
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

    // The cursor now points at the Restored event.
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
/// `target` and `source` before the restore — i.e. the fields the restore
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

    pub(crate) fn parent_snapshot(sequence: u64) -> AgentSnapshot {
        let genome_id = GenomeId::new();
        let branch_id = BranchId::new();
        let world_id = WorldId::new();

        AgentSnapshot {
            snapshot_id: SnapshotId::new(),
            agent_id: AgentId::new(),
            branch_id: branch_id.clone(),
            branch_metadata: BranchMetadata::default(),
            genome: AgentGenome {
                id: genome_id.clone(),
                parent_genome: None,
                parent_genomes: vec![],
                mutation: None,
                version: GenomeVersion("0.1.0".to_string()),
                identity: Identity {
                    name: "clone-no-llm".to_string(),
                    role: "tester".to_string(),
                },
                cognition: CognitionConfig {
                    exploration: 0.7,
                    risk_tolerance: 0.25,
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
                inferred_traits: vec![],
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
                memories: vec![],
                tool_outputs: vec![],
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
    fn same_genome_can_have_different_phenotype_state() {
        let parent = parent_snapshot(0);
        let mut agent_a = fork_snapshot(&parent);
        let mut agent_b = fork_snapshot(&parent);
        agent_a.state.set_variable("memory", "alpha");
        agent_b.state.set_variable("memory", "beta");

        let comparison = compare_genome_and_state(&agent_a, &agent_b);
        assert!(comparison.same_genome);
        assert_ne!(comparison.left_genome_hash, "");
        assert!(!comparison.same_phenotype_state);
    }

    #[test]
    fn different_genomes_can_start_with_identical_phenotype_state() {
        let base = parent_snapshot(0);
        let mut agent_a = base.clone();
        let mut agent_b = base;
        agent_a.genome = crate::mutate_exploration(&agent_a.genome, 0.4);
        agent_b.genome = crate::mutate_exploration(&agent_b.genome, 0.9);

        let comparison = compare_genome_and_state(&agent_a, &agent_b);
        assert!(!comparison.same_genome);
        assert!(comparison.same_phenotype_state);
        assert_eq!(agent_a.genome.cognition.exploration, 0.4);
        assert_eq!(agent_b.genome.cognition.exploration, 0.9);
    }

    #[test]
    fn fork_branches_keep_human_readable_hypotheses() {
        let parent = parent_snapshot(0);
        let a = fork_snapshot_with_hypothesis(&parent, "A", "database");
        let b = fork_snapshot_with_hypothesis(&parent, "B", "cache");
        let c = fork_snapshot_with_hypothesis(&parent, "C", "concurrency");

        assert_eq!(a.branch_metadata.hypothesis.as_deref(), Some("database"));
        assert_eq!(b.branch_metadata.hypothesis.as_deref(), Some("cache"));
        assert_eq!(c.branch_metadata.hypothesis.as_deref(), Some("concurrency"));
        assert_ne!(a.branch_id, b.branch_id);
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

/// What a [`checkpoint_snapshot`] call produced: the new snapshot on the
/// same branch with a fresh `snapshot_id`, plus the audit event the call
/// stamped. Mirrors [`RestoreWrite`] so a future unified event pipeline
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
///
/// Distinct from [`fork_snapshot`]: a fork changes `branch_id` and
/// starts on an empty event stream; a checkpoint stays on the same
/// branch and inherits the prior cursor (advanced past the new event).
/// Distinct from `snapshot save`: save is *id-stable* — calling it on
/// the same snapshot twice appends the same id twice — so a series of
/// save calls cannot express `S0 → S1 → S2 → S3` as distinct
/// `snapshot_id`s. Checkpoint is the primitive that does.
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

    // Carry current's logical state verbatim, but rebind the cursor's
    // branch to the current branch (it already equals current.branch_id,
    // but a defensive rebind keeps the lineage invariants honest). The
    // cursor's `last_event_id` clears first; we'll overwrite it with the
    // upcoming SnapshotCreated event id after the event is built.
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

#[cfg(test)]
#[path = "snapshot_restore_tests.rs"]
mod snapshot_restore_tests;

#[cfg(test)]
#[path = "snapshot_checkpoint_tests.rs"]
mod snapshot_checkpoint_tests;
