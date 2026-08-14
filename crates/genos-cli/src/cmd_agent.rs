use crate::args::{
    AgentCreateArgs, AgentForkFromSnapshotArgs, AgentInspectArgs, OutputFormat,
};
use crate::output::{
    print_serialized, write_serialized, AgentForkOutput, ForkEntry,
};
use crate::resolve::{
    event_store_from, read_genome, resolve_snapshot_ref, snapshot_store_from,
};
use anyhow::{bail, Result};
use chrono::Utc;
use genos_core::{
    fork_first_event_sequence, fork_snapshot, AgentEvent, AgentEventType, AgentGenome,
    AgentSnapshot, Capability, CognitionConfig, CorrelationId, EventId,
    GenomeId, GenomeVersion, Identity, MemoryPolicy, ModelPolicy, Objective, Policy,
    ToolPermission, ToolPolicy,
};
use genos_store::{EventStore, LocalEventStore, LocalSnapshotStore, SnapshotStore};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

pub fn cmd_init() -> Result<()> {
    fs::create_dir_all(".genos/agents")?;
    fs::create_dir_all(".genos/snapshots")?;
    fs::create_dir_all(".genos/world")?;
    println!("initialized .genos workspace");
    Ok(())
}

pub fn cmd_agent_create(args: AgentCreateArgs) -> Result<()> {
    let genome = AgentGenome {
        id: GenomeId::new(),
        version: GenomeVersion("0.1.0".to_string()),
        identity: Identity {
            name: args.name.clone(),
            role: args.role,
        },
        cognition: CognitionConfig {
            exploration: 0.7,
            verification_threshold: 0.8,
            planning_depth: 6,
        },
        objectives: vec![Objective {
            key: "tests_pass".to_string(),
            description: "Run tests before completion".to_string(),
        }],
        policies: vec![Policy {
            key: "evidence_before_claim".to_string(),
            description: "Claims require evidence".to_string(),
        }],
        capabilities: vec![Capability {
            name: "counterfactual_forking".to_string(),
            enabled: false,
        }],
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
            permissions: vec![
                ToolPermission {
                    tool: "filesystem".to_string(),
                    scope: "workspace".to_string(),
                    enabled: true,
                },
                ToolPermission {
                    tool: "shell".to_string(),
                    scope: "sandboxed".to_string(),
                    enabled: true,
                },
                ToolPermission {
                    tool: "network".to_string(),
                    scope: "denied".to_string(),
                    enabled: false,
                },
            ],
        },
    };

    let path = args
        .out
        .unwrap_or_else(|| PathBuf::from(format!(".genos/agents/{}.yaml", args.name)));
    write_serialized(&path, &genome, args.format)?;
    println!("agent genome written to {}", path.display());
    Ok(())
}

pub fn cmd_agent_inspect(args: AgentInspectArgs) -> Result<()> {
    let genome: AgentGenome = read_genome(&args.path)?;
    print_serialized(&genome, args.format)
}

pub async fn cmd_agent_fork_from_snapshot(args: AgentForkFromSnapshotArgs) -> Result<()> {
    if args.count == 0 {
        bail!("--count must be at least 1");
    }

    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let parent = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };

    // One correlation id ties the whole fan-out together across the sibling branches.
    let correlation_id = CorrelationId::new();
    let mut forks = Vec::with_capacity(args.count as usize);

    let out_dir = args.out_dir.clone();
    let out_prefix = args.out_prefix.clone();
    let save = args.save;
    for index in 1..=args.count {
        forks.push(
            build_fork_entry(
                index,
                &parent,
                out_dir.as_ref(),
                &out_prefix,
                save,
                &snapshot_store,
                event_store.as_ref(),
                &correlation_id,
            )
            .await?,
        );
    }

    let out = AgentForkOutput {
        parent_snapshot_id: parent.snapshot_id.0.clone(),
        parent_agent_id: parent.agent_id.0.clone(),
        parent_branch_id: parent.branch_id.0.clone(),
        count: forks.len(),
        saved_to_store: save,
        snapshot_store_path: save.then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        forks,
    };

    print_serialized(&out, args.format)
}

// 8 parameters: kept inline because the alternative (a builder struct for one
// private helper) would obscure the per-fork flow more than it clarifies.
// The two store refs are shared across the whole fan-out and would not benefit
// from being merged with the per-fork data.
#[allow(clippy::too_many_arguments)]
async fn build_fork_entry(
    index: u32,
    parent: &AgentSnapshot,
    out_dir: Option<&std::path::PathBuf>,
    out_prefix: &str,
    save: bool,
    snapshot_store: &LocalSnapshotStore,
    event_store: Option<&LocalEventStore>,
    correlation_id: &CorrelationId,
) -> Result<ForkEntry> {
    let fork = fork_snapshot(parent);
    let first_event_sequence = fork_first_event_sequence(&fork);

    let path = match out_dir {
        Some(dir) => {
            let path = dir.join(format!("{out_prefix}-{index}.json"));
            write_serialized(&path, &fork, OutputFormat::Json)?;
            Some(path.display().to_string())
        }
        None => None,
    };

    let fork_event_id = match event_store {
        Some(store) => {
            let event = AgentEvent {
                event_id: EventId::new(),
                agent_id: fork.agent_id.clone(),
                branch_id: Some(fork.branch_id.clone()),
                sequence: first_event_sequence,
                timestamp: Utc::now(),
                event_type: AgentEventType::ForkCreated,
                payload: json!({
                    "parent_snapshot_id": parent.snapshot_id.0,
                    "parent_agent_id": parent.agent_id.0,
                    "parent_branch_id": parent.branch_id.0,
                    "fork_index": index,
                    "fork_snapshot_id": fork.snapshot_id.0,
                }),
                causation_id: None,
                correlation_id: Some(correlation_id.clone()),
            };
            let event_id = event.event_id.0.clone();
            store.append(event).await?;
            Some(event_id)
        }
        None => None,
    };

    if save {
        snapshot_store.save_snapshot(fork.clone()).await?;
    }

    Ok(ForkEntry {
        index,
        snapshot_id: fork.snapshot_id.0.clone(),
        agent_id: fork.agent_id.0.clone(),
        branch_id: fork.branch_id.0.clone(),
        first_event_sequence,
        path,
        fork_event_id,
    })
}
