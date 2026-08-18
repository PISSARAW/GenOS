use crate::args::SnapshotCreateArgs;
use crate::output::write_serialized;
use crate::resolve::{parse_working_memory_items, read_genome};
use anyhow::Result;
use chrono::Utc;
use genos_core::{
    AgentId, AgentSnapshot, BranchId, EpisodicMemory, EventCursor, ExecutionMetadata, GenomeRef,
    Goal, MemoryId, RuntimeMetadata, SemanticMemory, SnapshotId, ToolState, WorkingMemory, WorldId,
};
use std::path::PathBuf;

pub fn cmd_snapshot_create(args: SnapshotCreateArgs) -> Result<()> {
    let genome = read_genome(&args.agent)?;
    let agent_id = AgentId::new();
    let branch_id = BranchId::new();
    let world_id = WorldId::new();

    let state = genos_core::AgentState {
        genome: GenomeRef {
            genome_id: genome.id.clone(),
            version: genome.version.0.clone(),
        },
        working_memory: WorkingMemory {
            items: parse_working_memory_items(&args.memory)?,
        },
        semantic_memory: SemanticMemory {
            refs: args
                .semantic_ref
                .iter()
                .map(|r| MemoryId(r.clone()))
                .collect(),
        },
        episodic_memory: EpisodicMemory {
            refs: args
                .episodic_ref
                .iter()
                .map(|r| MemoryId(r.clone()))
                .collect(),
        },
        // Seeded refs index memories held elsewhere; records are recorded on a
        // branch with `snapshot add-memory`.
        memories: vec![],
        tool_outputs: vec![],
        beliefs: vec![],
        active_goals: vec![Goal {
            key: "bootstrap".to_string(),
            description: "Initialize first runtime step".to_string(),
        }],
        world_id: world_id.clone(),
        event_cursor: EventCursor {
            branch_id: branch_id.clone(),
            sequence: 0,
            last_event_id: None,
        },
        execution: ExecutionMetadata {
            step: 0,
            last_model_provider: None,
        },
        artifact_refs: vec![],
    };

    let snapshot = AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id,
        branch_id,
        branch_metadata: genos_core::BranchMetadata::default(),
        genome,
        state,
        world_id,
        tool_state: ToolState {
            active_tools: vec![],
        },
        runtime_metadata: RuntimeMetadata {
            runtime_version: "0.0.1".to_string(),
            budget_steps_remaining: 0,
        },
        created_at: Utc::now(),
    };

    let path = args
        .out
        .unwrap_or_else(|| PathBuf::from(".genos/snapshots/latest.json"));
    write_serialized(&path, &snapshot, args.format)?;
    println!("snapshot written to {}", path.display());
    Ok(())
}
