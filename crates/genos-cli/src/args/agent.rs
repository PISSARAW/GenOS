use super::{
    ArgsMacro, CapsuleForkArgs, CapsuleIdArgs, DiffArgs, GenericExperimentArgs, OutputFormat,
    ReplayBasicArgs, SnapshotLineageArgs,
};
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct AgentCommand {
    #[command(subcommand)]
    pub command: AgentSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum AgentSubcommands {
    /// Initialize a local GenOS repository.
    Init,
    /// Checkpoint an atomic agent + world capsule.
    Snapshot(CapsuleIdArgs),
    /// Restore a paused agent + world capsule into a live world.
    Restore(CapsuleIdArgs),
    /// Fork an atomic agent + world capsule into isolated branches.
    Fork(CapsuleForkArgs),
    Create(AgentCreateArgs),
    Inspect(AgentInspectArgs),
    /// Derive a new genome by applying relative cognition changes.
    Mutate(AgentMutateArgs),
    /// Recombine two genomes from comparable measured phenotype evidence.
    Breed(AgentBreedArgs),
    /// Infer evidence-backed genome trait claims from phenotype observations.
    InferTraits(AgentInferTraitsArgs),
    /// Promote a replicated inferred trait through an explicit genome mutation.
    PromoteTrait(AgentPromoteTraitArgs),
    /// Execute one command inside a capsule's isolated world.
    Run(AgentRunArgs),
    /// Compare the logical state of two agent snapshots.
    Diff(DiffArgs),
    /// Reconcile branch experiences with the Cognitive Merge Engine.
    Merge(GenericExperimentArgs),
    /// Show the snapshot lineage DAG.
    Lineage(SnapshotLineageArgs),
    /// Replay an agent's event stream.
    Replay(ReplayBasicArgs),
    /// Derive counterfactual forks from an existing snapshot, without any model call.
    ForkFromSnapshot(AgentForkFromSnapshotArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct AgentRunArgs {
    pub capsule_id: String,
    /// Command executed inside the capsule's isolated world.
    #[arg(long)]
    pub command: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Return success even when the command exits with a non-zero status.
    #[arg(long)]
    pub allow_failure: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct AgentPromoteTraitArgs {
    pub genome: PathBuf,
    #[arg(long = "trait")]
    pub trait_name: String,
    #[arg(long)]
    pub field: String,
    #[arg(long)]
    pub out: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct AgentBreedArgs {
    pub alice: PathBuf,
    pub bob: PathBuf,
    #[arg(long)]
    pub evidence: PathBuf,
    #[arg(long)]
    pub out: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct AgentInferTraitsArgs {
    pub genome: PathBuf,
    #[arg(long = "phenotype", required = true)]
    pub phenotypes: Vec<PathBuf>,
    #[arg(long = "trait", required = true)]
    pub traits: Vec<String>,
    #[arg(long)]
    pub out: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    pub format: OutputFormat,
}

fn parse_key_val<T, U>(s: &str) -> Result<(T, U), Box<dyn std::error::Error + Send + Sync + 'static>>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
    U: std::str::FromStr,
    U::Err: std::error::Error + Send + Sync + 'static,
{
    let pos = s
        .find('=')
        .ok_or_else(|| format!("invalid KEY=value: no `=` found in `{s}`"))?;
    Ok((s[..pos].parse()?, s[pos + 1..].parse()?))
}

#[derive(ArgsMacro, Debug)]
pub struct AgentMutateArgs {
    pub path: PathBuf,
    #[arg(long = "drive", value_parser = parse_key_val::<String, f32>)]
    pub drives: Vec<(String, f32)>,
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct AgentCreateArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub role: String,
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct AgentInspectArgs {
    pub path: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct AgentForkFromSnapshotArgs {
    /// Parent snapshot: either a file path or a snapshot id resolved in the snapshot store.
    #[arg(long)]
    pub snapshot: String,
    /// Number of sibling forks to derive.
    #[arg(long, default_value_t = 2)]
    pub count: u32,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist forks with `--save`.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Append each fork to the snapshot store.
    #[arg(long)]
    pub save: bool,
    /// Event store receiving one `fork_created` event per fork with `--emit-events`.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append one `fork_created` event per fork, on the fork's own branch.
    #[arg(long)]
    pub emit_events: bool,
    /// Write each fork as `<out-prefix>-<n>.json` into this directory.
    #[arg(long)]
    pub out_dir: Option<PathBuf>,
    #[arg(long, default_value = "fork")]
    pub out_prefix: String,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}
