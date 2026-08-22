use super::*;
use crate::{
    CognitionConfig, EpisodicMemory, EventCursor, ExecutionMetadata, GenomeId, GenomeRef,
    GenomeVersion, Goal, Identity, MemoryId, MemoryPolicy, ModelPolicy, SemanticMemory,
    ToolPolicy, WorkingMemory, WorkingMemoryItem,
};
use crate::ids::{AgentId, BranchId, SnapshotId, WorldId};
use crate::AgentGenome;
use chrono::Utc;

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
            ecological_niche: None,
            version: GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: "clone-no-llm".to_string(),
                role: "tester".to_string(),
            },
            cognition: CognitionConfig {
                chromosomes: vec![
                    crate::Chromosome {
                        name: "C1".to_string(),
                        operons: vec![],
                        loci: vec![
                            crate::Locus { gene_name: "exploration".to_string(), value: 0.7, epigenetic_marker: 0.0 },
                            crate::Locus { gene_name: "risk_tolerance".to_string(), value: 0.25, epigenetic_marker: 0.0 },
                            crate::Locus { gene_name: "verification_threshold".to_string(), value: 0.8, epigenetic_marker: 0.0 },
                        ],
                    }
                ],
                planning_depth: 6,
                regulators: vec![],
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
            breeding: None,
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
    let mut changes_a = std::collections::BTreeMap::new();
    changes_a.insert("exploration".to_string(), 0.4);
    agent_a.genome = crate::mutate_cognition(&agent_a.genome, changes_a);

    let mut changes_b = std::collections::BTreeMap::new();
    changes_b.insert("exploration".to_string(), 0.9);
    agent_b.genome = crate::mutate_cognition(&agent_b.genome, changes_b);

    let comparison = compare_genome_and_state(&agent_a, &agent_b);
    assert!(!comparison.same_genome);
    assert!(comparison.same_phenotype_state);
    assert_eq!(agent_a.genome.cognition.get_drive("exploration").unwrap(), 0.4);
    assert_eq!(agent_b.genome.cognition.get_drive("exploration").unwrap(), 0.9);
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
