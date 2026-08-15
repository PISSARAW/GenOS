use crate::args::{CapsuleCreateArgs, CapsuleForkArgs, CapsuleIdArgs};
use crate::output::print_serialized;
use crate::resolve::{resolve_snapshot_ref, snapshot_store_from};
use anyhow::{Context, Result};
use genos_core::{AgentWorldCapsule, CapsuleLifecycle, CapsuleRelation};
use genos_runtime::{
    checkpoint_capsule, default_capsule_components, fork_counterfactual_capsules, pause_capsule,
    resume_capsule, CounterfactualBranchSpec,
};
use genos_store::{CapsuleStore, LocalCapsuleStore};
use genos_world::{DirectoryWorldProvider, WorldProvider};

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

#[allow(dead_code)]
fn _lifecycle_marker(value: CapsuleLifecycle) -> CapsuleLifecycle {
    value
}
