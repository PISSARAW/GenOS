use crate::args::{AgentRunArgs, CapsuleCreateArgs, CapsuleForkArgs, CapsuleIdArgs};
use crate::output::print_serialized;
use crate::resolve::{event_store_from, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{Context, Result};
use chrono::Utc;
use genos_core::{
    AgentEvent, AgentEventType, AgentWorldCapsule, CapsuleLifecycle, CapsuleRelation,
    CorrelationId, EventId,
};
use genos_runtime::{
    checkpoint_capsule, default_capsule_components, fork_counterfactual_capsules, pause_capsule,
    resume_capsule, CounterfactualBranchSpec,
};
use genos_store::{CapsuleStore, EventStore, LocalCapsuleStore};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use serde::Serialize;
use serde_json::json;

fn stores(root: &std::path::Path) -> (LocalCapsuleStore, Result<DirectoryWorldProvider>) {
    (
        LocalCapsuleStore::from_root(root),
        DirectoryWorldProvider::new(root.join("worlds"), None),
    )
}

async fn load(store: &LocalCapsuleStore, id: &str) -> Result<AgentWorldCapsule> {
    store
        .get_capsule(id.to_string())
        .await?
        .with_context(|| format!("unknown capsule {id}"))
}

pub async fn cmd_capsule_create(args: CapsuleCreateArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(None, &args.root);
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;
    snapshot.runtime_metadata.budget_steps_remaining = args.budget_steps;
    let provider = DirectoryWorldProvider::new(args.root.join("worlds"), args.seed)?;
    let world_id = provider
        .create(snapshot.agent_id.clone(), snapshot.branch_id.clone())
        .await?;
    snapshot.world_id = world_id.clone();
    snapshot.state.world_id = world_id.clone();
    let world_snapshot = provider.snapshot(world_id.clone()).await?;
    let capsule = AgentWorldCapsule::new(
        snapshot,
        world_snapshot,
        Some(world_id),
        default_capsule_components(),
        None,
        CapsuleRelation::Genesis,
    );
    let store = LocalCapsuleStore::from_root(&args.root);
    store.save_capsule(capsule.clone()).await?;
    print_serialized(&capsule, crate::args::OutputFormat::Json)
}

pub async fn cmd_capsule_fork(args: CapsuleForkArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let provider = provider?;
    let parent = load(&store, &args.capsule_id).await?;
    let specs = args
        .branches
        .iter()
        .map(|entry| {
            let (label, hypothesis) = entry
                .split_once('=')
                .with_context(|| format!("--branch expects LABEL=HYPOTHESIS, got {entry}"))?;
            Ok(CounterfactualBranchSpec {
                label: label.to_string(),
                hypothesis: hypothesis.to_string(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let capsules = fork_counterfactual_capsules(&provider, &store, &parent, &specs).await?;
    print_serialized(&capsules, crate::args::OutputFormat::Json)
}

pub async fn cmd_capsule_checkpoint(args: CapsuleIdArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let capsule = load(&store, &args.capsule_id).await?;
    let checkpoint = checkpoint_capsule(&provider?, &store, &capsule).await?;
    print_serialized(&checkpoint, crate::args::OutputFormat::Json)
}

pub async fn cmd_capsule_pause(args: CapsuleIdArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let capsule = load(&store, &args.capsule_id).await?;
    let paused = pause_capsule(&provider?, &store, &capsule).await?;
    print_serialized(&paused, crate::args::OutputFormat::Json)
}

pub async fn cmd_capsule_resume(args: CapsuleIdArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let capsule = load(&store, &args.capsule_id).await?;
    let resumed = resume_capsule(&provider?, &store, &capsule).await?;
    print_serialized(&resumed, crate::args::OutputFormat::Json)
}

pub async fn cmd_capsule_inspect(args: CapsuleIdArgs) -> Result<()> {
    let store = LocalCapsuleStore::from_root(&args.root);
    let capsule = load(&store, &args.capsule_id).await?;
    if !capsule.verify_integrity() {
        anyhow::bail!("capsule integrity verification failed");
    }
    print_serialized(&capsule, crate::args::OutputFormat::Json)
}

#[derive(Serialize)]
struct AgentRunOutput {
    capsule: AgentWorldCapsule,
    exit_code: i32,
    stdout: String,
    stderr: String,
}

pub async fn cmd_agent_run(args: AgentRunArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let provider = provider?;
    let mut capsule = load(&store, &args.capsule_id).await?;
    if !capsule.verify_integrity() {
        anyhow::bail!("capsule integrity verification failed");
    }
    if capsule.lifecycle == CapsuleLifecycle::Created {
        capsule
            .transition(CapsuleLifecycle::Running)
            .map_err(anyhow::Error::msg)?;
    }
    if capsule.budget.steps_remaining == 0 {
        anyhow::bail!("capsule execution budget is exhausted");
    }
    let world_id = capsule
        .live_world_id
        .clone()
        .context("capsule has no live world; restore it before running")?;
    let result = provider.execute(world_id, &args.command).await?;
    let event_id = EventId::new();
    let causation_id = capsule
        .agent_snapshot
        .state
        .event_cursor
        .last_event_id
        .clone();
    capsule
        .consume_step(event_id.clone())
        .map_err(anyhow::Error::msg)?;
    let event = AgentEvent {
        cost_schema: None,
        event_id,
        agent_id: capsule.agent_snapshot.agent_id.clone(),
        branch_id: Some(capsule.branch_id.clone()),
        sequence: capsule.agent_snapshot.state.event_cursor.sequence,
        timestamp: Utc::now(),
        event_type: AgentEventType::AgentStep,
        payload: json!({
            "command": args.command,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "budget_steps_remaining": capsule.budget.steps_remaining,
        }),
        causation_id,
        correlation_id: Some(CorrelationId::new()),
    };
    event_store_from(None, &args.root).append(event).await?;
    store.save_capsule(capsule.clone()).await?;
    let exit_code = result.exit_code;
    print_serialized(
        &AgentRunOutput {
            capsule,
            exit_code,
            stdout: result.stdout,
            stderr: result.stderr,
        },
        args.format,
    )?;
    if exit_code != 0 && !args.allow_failure {
        anyhow::bail!("world command exited with status {exit_code}");
    }
    Ok(())
}

#[allow(dead_code)]
fn _lifecycle_marker(value: CapsuleLifecycle) -> CapsuleLifecycle {
    value
}
