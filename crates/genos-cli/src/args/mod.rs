use clap::{Parser, Subcommand, ValueEnum};
use genos_core::MemoryKind;
use std::path::PathBuf;

pub mod agent;
pub mod experiment;
pub mod inspect;
pub mod replay;
pub mod snapshot;
pub mod world;

pub use agent::*;
pub use experiment::*;
pub use inspect::*;
pub use replay::*;
pub use snapshot::*;
pub use world::*;

#[derive(Parser, Debug)]
#[command(name = "genos")]
#[command(about = "Genome Operating System for Agents")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    Init,
    Agent(AgentCommand),
    /// Run persisted counterfactual experiments from reusable manifests.
    Experiment(ExperimentCommand),
    Snapshot(SnapshotCommand),
    World(WorldCommand),
    Replay(ReplayCommand),
    /// Inspect typed entities on a snapshot — belief provenance trees, etc.
    Inspect(InspectCommand),
    /// Diff the logical state of two snapshots. Identity fields are excluded,
    /// so two untouched forks of one snapshot diff to nothing.
    Diff(DiffArgs),
}

#[derive(ArgsMacro, Debug)]
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
    #[arg(long, value_enum, default_value_t = DiffFormat::Json)]
    pub format: DiffFormat,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum DiffFormat {
    Json,
    Yaml,
    Text,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum MemoryKindArg {
    Semantic,
    Episodic,
}

impl From<MemoryKindArg> for MemoryKind {
    fn from(kind: MemoryKindArg) -> Self {
        match kind {
            MemoryKindArg::Semantic => MemoryKind::Semantic,
            MemoryKindArg::Episodic => MemoryKind::Episodic,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum WorldProviderKind {
    Directory,
    GitWorktree,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum OutputFormat {
    Json,
    Yaml,
}

// `Args` is a derive macro from clap; a local alias keeps the derive line
// in each per-domain file short without importing clap twice.
use clap::Args as ArgsMacro;
