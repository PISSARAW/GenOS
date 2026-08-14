use clap::{Args, Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    Init,
    Agent(AgentCommand),
    Snapshot(SnapshotCommand),
    World(WorldCommand),
    Replay(ReplayCommand),
    /// Diff the logical state of two snapshots. Identity fields are excluded,
    /// so two untouched forks of one snapshot diff to nothing.
    Diff(DiffArgs),
}

#[derive(Args, Debug)]
pub struct DiffArgs {
    /// Left side: file path or snapshot id resolved in the snapshot store.
    pub a: String,
    /// Right side: file path or snapshot id resolved in the snapshot store.
    pub b: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub store: Option<PathBuf>,
    /// Exit non-zero unless the two snapshots are semantically identical.
    #[arg(long)]
    pub expect_empty: bool,
    /// Exit non-zero unless the changed paths are exactly these. Repeatable,
    /// and mutually exclusive with `--expect-empty`.
    #[arg(
        long = "expect-changed-path",
        value_name = "PATH",
        conflicts_with = "expect_empty"
    )]
    pub expect_changed_paths: Vec<String>,
    /// `text` prints one section header per changed area, then each path with
    /// its old and new value.
    #[arg(long, value_enums, default_value_t = DiffFormat::Json)]
    pub format: DiffFormat,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum DiffFormat {
    Json,
    Yaml,
    Text,
}

#[derive(Args, Debug)]
pub struct AgentCommand {
    #[command(subcommand)]
    pub command: AgentSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum AgentSubcommands {
    Create(AgentCreateArgs),
    Inspect(AgentInspectArgs),
    /// Derive counterfactual forks from an existing snapshot, without any model call.
    ForkFromSnapshot(AgentForkFromSnapshotArgs),
}

#[derive(Args, Debug)]
pub struct AgentCreateArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub role: String,
}

#[derive(Args, Debug)]
pub struct AgentInspectArgs {
    #[arg(long)]
    pub path: String,
    #[arg(long)]
    pub format: Option<String>,
}

#[derive(Args, Debug)]
pub struct AgentForkFromSnapshotArgs {
    #[arg(long)]
    pub path: String,
    #[arg(long)]
    pub count: usize,
}

#[derive(Args, Debug)]
pub struct SnapshotCommand {
    #[command(subcommand)]
    pub command: SnapshotSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum SnapshotSubcommands {
    Create(SnapshotCreateArgs),
    Save(SnapshotSaveArgs),
    Get(SnapshotGetArgs),
    List(SnapshotListArgs),
    Compare(SnapshotCompareArgs),
    SetVar(SnapshotSetVarArgs),
    CheckVar(SnapshotCheckVarArgs),
    SetCognition(SnapshotSetCognitionArgs),
    AddMemory(SnapshotAddMemoryArgs),
}

#[derive(Args, Debug)]
pub struct SnapshotCreateArgs {
    #[arg(long)]
    pub agent: String,
}

#[derive(Args, Debug)]
pub struct SnapshotSaveArgs {
    #[arg(long)]
    pub agent: String,
}

#[derive(Args, Debug)]
pub struct SnapshotGetArgs {
    #[arg(long)]
    pub agent: String,
}

#[derive(Args, Debug)]
pub struct SnapshotListArgs {}

#[derive(Args, Debug)]
pub struct SnapshotCompareArgs {
    #[arg(long)]
    pub a: String,
    #[arg(long)]
    pub b: String,
}

#[derive(Args, Debug)]
pub struct SnapshotSetVarArgs {
    #[arg(long)]
    pub agent: String,
    #[arg(long)]
    pub key: String,
    #[arg(long)]
    pub value: String,
}

#[derive(Args, Debug)]
pub struct SnapshotCheckVarArgs {
    #[arg(long)]
    pub agent: String,
    #[arg(long)]
    pub key: String,
}

#[derive(Args, Debug)]
pub struct SnapshotSetCognitionArgs {
    #[arg(long)]
    pub agent: String,
    pub exploration: Option<String>,
    pub verification_threshold: Option<String>,
    pub planning_depth: Option<String>,
    pub save: bool,
    pub out: Option<String>,
    pub format: Option<String>,
}

#[derive(Args, Debug)]
pub struct SnapshotAddMemoryArgs {
    #[arg(long)]
    pub agent: String,
    #[arg(long)]
    pub kind: String,
    #[arg(long)]
    pub content: String,
    #[arg(long)]
    pub source: Option<String>,
}
