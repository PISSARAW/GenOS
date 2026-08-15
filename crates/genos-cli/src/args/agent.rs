use super::ArgsMacro;
use super::OutputFormat;
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct AgentCommand {
    #[command(subcommand)]
    pub command: AgentSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum AgentSubcommands {
    Create(AgentCreateArgs),
    Inspect(AgentInspectArgs),
    /// Derive a new genome by applying relative cognition changes.
    Mutate(AgentMutateArgs),
    /// Derive counterfactual forks from an existing snapshot, without any model call.
    ForkFromSnapshot(AgentForkFromSnapshotArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct AgentMutateArgs {
    pub path: PathBuf,
    #[arg(long, allow_hyphen_values = true)]
    pub exploration: Option<f32>,
    #[arg(long, allow_hyphen_values = true)]
    pub risk: Option<f32>,
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
