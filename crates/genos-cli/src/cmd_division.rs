use crate::args::{
    DivisionBudArgs, DivisionFissionArgs, DivisionMitosisArgs, DivisionSchizogonyArgs,
};
use crate::output::print_serialized;
use anyhow::{Context, Result};
use genos_core::AgentWorldCapsule;
use genos_runtime::{
    binary_fission_capsules, bud_capsule, mitotic_fork_capsules, schizogonic_burst, BudSpec,
    SchizogonyBranchSpec,
};
use genos_store::{CapsuleStore, LocalCapsuleStore};
use genos_world::DirectoryWorldProvider;

fn stores(
    root: &std::path::Path,
) -> (
    LocalCapsuleStore,
    anyhow::Result<DirectoryWorldProvider>,
) {
    (
        LocalCapsuleStore::from_root(root),
        DirectoryWorldProvider::new(root.join("worlds"), None),
    )
}

async fn load(store: &LocalCapsuleStore, id: &str) -> Result<AgentWorldCapsule> {
    let capsule = store
        .get_capsule(id.to_string())
        .await?
        .with_context(|| format!("unknown capsule {id}"))?;
    if !capsule.verify_integrity() {
        anyhow::bail!("capsule {id} failed integrity verification");
    }
    Ok(capsule)
}

pub async fn cmd_division_mitosis(args: DivisionMitosisArgs) -> Result<()> {
    if args.count == 0 {
        anyhow::bail!("--count must be at least 1");
    }
    let (store, provider) = stores(&args.root);
    let parent = load(&store, &args.capsule_id).await?;
    let outcome =
        mitotic_fork_capsules(&provider?, &store, &parent, args.count).await?;
    if !outcome.all_clones_verified {
        anyhow::bail!("mitotic attestation failed; daughters cancelled");
    }
    print_serialized(&outcome.report(&parent.capsule_id.0), crate::args::OutputFormat::Json)
}

pub async fn cmd_division_fission(args: DivisionFissionArgs) -> Result<()> {
    if args.count == 0 {
        anyhow::bail!("--count must be at least 1");
    }
    let (store, provider) = stores(&args.root);
    let parent = load(&store, &args.capsule_id).await?;
    let outcome = binary_fission_capsules(&provider?, &store, &parent, args.count).await?;
    print_serialized(&outcome.report(&parent.capsule_id.0), crate::args::OutputFormat::Json)
}

pub async fn cmd_division_bud(args: DivisionBudArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let parent = load(&store, &args.capsule_id).await?;
    let outcome = bud_capsule(
        &provider?,
        &store,
        &parent,
        &BudSpec {
            label: args.label.clone(),
            hypothesis: args.hypothesis.clone(),
            bud_steps: args.steps,
        },
        args.max_buds,
    )
    .await?;
    println!(
        "bud `{}` released with scar count {} on parent {}",
        args.label, outcome.scar_count, parent.capsule_id.0
    );
    print_serialized(&outcome.report(&parent.capsule_id.0), crate::args::OutputFormat::Json)
}

pub async fn cmd_division_schizogony(args: DivisionSchizogonyArgs) -> Result<()> {
    let (store, provider) = stores(&args.root);
    let parent = load(&store, &args.capsule_id).await?;
    let specs = args
        .branches
        .iter()
        .map(|entry| {
            let (label, hypothesis) = entry
                .split_once('=')
                .with_context(|| format!("--branch expects LABEL=HYPOTHESIS, got {entry}"))?;
            Ok(SchizogonyBranchSpec {
                label: label.to_string(),
                hypothesis: hypothesis.to_string(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let burst = schizogonic_burst(&provider?, &store, &parent, &specs).await?;
    println!("burst {} released", burst.burst_id);
    print_serialized(&burst.report(&parent.capsule_id.0), crate::args::OutputFormat::Json)
}
