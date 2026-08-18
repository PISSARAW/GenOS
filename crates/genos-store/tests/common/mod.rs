#![allow(dead_code)]

use chrono::Utc;
use genos_core::{
    AgentEvent, AgentEventType, AgentId, AgentSnapshot, BranchId, CorrelationId, EventCursor,
    EventId, ExecutionMetadata, GenomeId, GenomeRef, RuntimeMetadata, SnapshotId, ToolState,
    WorldId,
};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_TEMP_STORE_ID: AtomicU64 = AtomicU64::new(0);

pub fn make_event(event_type: AgentEventType, sequence: u64, branch: &str) -> AgentEvent {
    AgentEvent {
        event_id: EventId::new(),
        agent_id: AgentId::new(),
        branch_id: Some(BranchId(branch.to_string())),
        sequence,
        timestamp: Utc::now(),
        event_type,
        payload: json!({"sequence": sequence}),
        causation_id: None,
        correlation_id: Some(CorrelationId::new()),
    }
}

pub fn temp_store_path() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time is before unix epoch")
        .as_nanos();
    let sequence = NEXT_TEMP_STORE_ID.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "genos-store-test-{}-{nanos}-{sequence}.jsonl",
        std::process::id()
    ))
}

pub fn make_snapshot(sequence: u64) -> AgentSnapshot {
    let genome_id = GenomeId::new();
    let branch_id = BranchId::new();
    let world_id = WorldId::new();

    AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id: AgentId::new(),
        branch_id: branch_id.clone(),
        branch_metadata: genos_core::BranchMetadata::default(),
        genome: genos_core::AgentGenome {
            id: genome_id.clone(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            ecological_niche: None,
            version: genos_core::GenomeVersion("0.1.0".to_string()),
            identity: genos_core::Identity {
                name: "test-agent".to_string(),
                role: "tester".to_string(),
            },
            cognition: genos_core::CognitionConfig {
                chromosomes: vec![
                    genos_core::Chromosome {
                        name: "C1".to_string(),
                        loci: vec![
                            genos_core::Locus { gene_name: "exploration".to_string(), value: 0.7, epigenetic_marker: 0.0 },
                            genos_core::Locus { gene_name: "risk_tolerance".to_string(), value: 0.25, epigenetic_marker: 0.0 },
                            genos_core::Locus { gene_name: "verification_threshold".to_string(), value: 0.8, epigenetic_marker: 0.0 },
                        ],
                    }
                ],
                planning_depth: 6,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: genos_core::MemoryPolicy {
                working_max_items: 16,
                episodic_enabled: true,
                semantic_enabled: true,
            },
            model_policy: genos_core::ModelPolicy {
                strategy: "provider-agnostic".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: genos_core::ToolPolicy {
                permissions: vec![],
            },
            inferred_traits: vec![],
            breeding: None,
        },
        state: genos_core::AgentState {
            genome: GenomeRef {
                genome_id,
                version: "0.1.0".to_string(),
            },
            working_memory: genos_core::WorkingMemory { items: vec![] },
            semantic_memory: genos_core::SemanticMemory { refs: vec![] },
            episodic_memory: genos_core::EpisodicMemory { refs: vec![] },
            memories: vec![],
            tool_outputs: vec![],
            beliefs: vec![],
            active_goals: vec![],
            world_id: world_id.clone(),
            event_cursor: EventCursor {
                branch_id,
                sequence,
                last_event_id: None,
            },
            execution: ExecutionMetadata {
                step: sequence,
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
            budget_steps_remaining: 10,
        },
        created_at: Utc::now(),
    }
}
