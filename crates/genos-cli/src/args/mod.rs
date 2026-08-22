use clap::{Parser, Subcommand, ValueEnum};
use genos_core::MemoryKind;
use std::path::PathBuf;

pub mod agent;
pub mod biomimicry;
pub mod capsule;
pub mod dev;
pub mod experiment;
pub mod hallucination;
pub mod inspect;
pub mod replay;
pub mod resilience;
pub mod snapshot;
pub mod world;

pub use agent::*;
pub use biomimicry::*;
pub use capsule::*;
pub use dev::*;
pub use experiment::*;
pub use hallucination::*;
pub use inspect::*;
pub use replay::*;
pub use resilience::*;
pub use snapshot::*;
pub use world::*;

#[derive(Parser, Debug)]
#[command(name = "genos")]
#[command(about = "Genome Operating System for Agents")]
#[command(version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    Init,
    Agent(AgentCommand),
    Capsule(CapsuleCommand),
    /// Software-development trajectory engineering and organizational memory.
    Dev(DevCommand),
    /// Run persisted counterfactual experiments from reusable manifests.
    Experiment(ExperimentCommand),
    Snapshot(SnapshotCommand),
    World(WorldCommand),
    Replay(ReplayCommand),
    /// Inspect typed entities on a snapshot â€” belief provenance trees, etc.
    Inspect(InspectCommand),
    /// Diff the logical state of two snapshots. Identity fields are excluded,
    /// so two untouched forks of one snapshot diff to nothing.
    Diff(DiffArgs),
    /// Triggers for biological resilience concepts like Apoptosis and Fuzzing.
    Resilience(ResilienceCommand),
    /// Triggers for biomimetic organizational concepts like Swarms and Flocking.
    Biomimicry(BiomimicryCommand),
    /// Hallucination mitigation and detection commands.
    Hallucination(HallucinationCommand),
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

#[cfg(test)]
mod tests {
    use super::Cli;
    use clap::Parser;

    #[test]
    fn canonical_agent_primitives_parse() {
        let commands = [
            vec!["genos", "agent", "init"],
            vec!["genos", "agent", "snapshot", "capsule-1"],
            vec!["genos", "agent", "restore", "capsule-1"],
            vec![
                "genos",
                "agent",
                "fork",
                "capsule-1",
                "--branch",
                "A=hypothesis",
            ],
            vec!["genos", "agent", "mutate", "genome.yaml"],
            vec!["genos", "agent", "run", "capsule-1", "--command", "echo ok"],
            vec!["genos", "agent", "diff", "snapshot-a", "snapshot-b"],
            vec!["genos", "agent", "merge", "merge.yaml"],
            vec!["genos", "agent", "lineage"],
            vec!["genos", "agent", "replay"],
        ];

        for command in commands {
            assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
        }
    }

    #[test]
    fn experiment_direct_input_modes_parse() {
        let commands = [
            vec![
                "genos",
                "experiment",
                "workspace",
                "--repo",
                "calculator",
                "--plan",
                "workspace.yaml",
            ],
            vec![
                "genos",
                "experiment",
                "incident",
                "--snapshot",
                "production@incident-42",
                "--evidence",
                "evidence.yaml",
                "--search-plan",
                "search.yaml",
            ],
            vec![
                "genos",
                "experiment",
                "scientific",
                "--dataset",
                "records.txt",
                "--research-plan",
                "research.yaml",
            ],
            vec![
                "genos",
                "experiment",
                "security-coevolution",
                "--environment",
                "lab.yaml",
                "--evolution-plan",
                "evolution.yaml",
            ],
            vec![
                "genos",
                "experiment",
                "bug-investigation",
                "--repo",
                "service",
                "--plan",
                "hypotheses.yaml",
            ],
        ];

        for command in commands {
            assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
        }
    }

    #[test]
    fn experiment_manifest_modes_remain_compatible() {
        for subcommand in [
            "workspace",
            "incident",
            "scientific",
            "security-coevolution",
            "bug-investigation",
        ] {
            let command = ["genos", "experiment", subcommand, "experiment.yaml"];
            assert!(Cli::try_parse_from(command).is_ok(), "{command:?}");
        }
    }
}
