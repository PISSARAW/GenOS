use clap::{Parser, Subcommand, ValueEnum};
use genos_core::MemoryKind;
use std::path::PathBuf;

pub mod agent;
pub mod biomimicry;
pub mod capsule;
pub mod dev;
pub mod division;
pub mod eval;
pub mod experiment;
pub mod hallucination;
pub mod inspect;
pub mod platform;
pub mod prompt;
pub mod replay;
pub mod resilience;
pub mod snapshot;
pub mod swarm;
pub mod workflow;
pub mod world;

pub use agent::*;
pub use biomimicry::*;
pub use capsule::*;
pub use dev::*;
pub use division::*;
pub use eval::*;
pub use experiment::*;
pub use hallucination::*;
pub use inspect::*;
pub use platform::*;
pub use prompt::*;
pub use replay::*;
pub use resilience::*;
pub use snapshot::*;
pub use swarm::*;
pub use workflow::*;
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
    /// KNOWLEDGE Layer: Query biomimetic concepts dynamically
    KnowledgeQuery,
    /// INTENT Layer: Asynchronous execution of a problem
    RunIntent,
    /// INTENT Layer: Asynchronous verification
    VerifyIntent,
    /// STATE Layer: Read the asynchronous blackboard
    Status,
    /// INTENT Layer: Garbage collect the blackboard state
    GarbageCollect,
    /// OBSERVER Layer: Stream telemetry of a running swarm
    Telemetry,
    #[command(hide = true)]
    Init,
    #[command(hide = true)]
    Agent(AgentCommand),
    #[command(hide = true)]
    Capsule(CapsuleCommand),
    /// Cell-division primitives: mitosis, binary fission, budding, schizogony.
    #[command(hide = true)]
    Division(DivisionCommand),
    /// Software-development trajectory engineering and organizational memory.
    #[command(hide = true)]
    Dev(DevCommand),
    /// Run persisted counterfactual experiments from reusable manifests.
    #[command(hide = true)]
    Experiment(ExperimentCommand),
    #[command(hide = true)]
    Snapshot(SnapshotCommand),
    #[command(hide = true)]
    Swarm(SwarmCommand),
    #[command(hide = true)]
    World(WorldCommand),
    #[command(hide = true)]
    Replay(ReplayCommand),
    /// Inspect typed entities on a snapshot â€” belief provenance trees, etc.
    #[command(hide = true)]
    Inspect(InspectCommand),
    /// Diff the logical state of two snapshots. Identity fields are excluded,
    /// so two untouched forks of one snapshot diff to nothing.
    #[command(hide = true)]
    Diff(DiffArgs),
    /// Triggers for biological resilience concepts like Apoptosis and Fuzzing.
    #[command(hide = true)]
    Resilience(ResilienceCommand),
    /// Triggers for biomimetic organizational concepts like Swarms and Flocking.
    #[command(hide = true)]
    Biomimicry(BiomimicryCommand),
    /// Hallucination mitigation and detection commands.
    #[command(hide = true)]
    Hallucination(HallucinationCommand),
    /// Configurable agent graphs, workflows, streaming and human approval.
    #[command(hide = true)]
    Workflow(WorkflowCommand),
    /// Platform primitives: RAG indexing, retrieval and citations.
    #[command(hide = true)]
    Platform(PlatformCommand),
    /// Versioned prompt templates and dynamic context rendering.
    #[command(hide = true)]
    Prompt(PromptCommand),
    /// Persistent evaluation datasets and batch scoring.
    #[command(hide = true)]
    Eval(EvalCommand),
    #[command(hide = true)]
    Audit(crate::cmd_audit::AuditArgs),
    #[command(hide = true)]
    Merge(crate::cmd_merge::MergeArgs),
    /// Manage and expose storage adapters
    #[command(hide = true)]
    Storage(crate::cmd_storage::StorageArgs),
    /// Manage and expose network transports
    #[command(hide = true)]
    Transport(crate::cmd_transport::TransportArgs),
    #[command(hide = true)]
    Epigenetics(crate::cmd_epigenetics::EpigeneticsArgs),
    #[command(hide = true)]
    Operon(crate::cmd_operon::OperonArgs),
    #[command(hide = true)]
    Hgt(crate::cmd_hgt::HgtTransposonArgs),
    #[command(hide = true)]
    Scheduler(crate::cmd_scheduler::SchedulerArgs),
    #[command(hide = true)]
    LoopDetection(crate::cmd_loop_detection::LoopDetectionArgs),
    #[command(hide = true)]
    Causality(crate::cmd_causality::CausalityArgs),
    #[command(hide = true)]
    Phenotype(crate::cmd_phenotype::PhenotypeArgs),
    #[command(hide = true)]
    Rebase(crate::cmd_rebase::RebaseArgs),
    #[command(hide = true)]
    Guardrails(crate::cmd_guardrails::GuardrailsArgs),
    #[command(hide = true)]
    CostAccounting(crate::cmd_cost_accounting::CostAccountingArgs),
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
    Hardlink,
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
mod tests;

#[derive(ValueEnum, Clone, Debug)]
pub enum SandboxBackendArg {
    Bwrap,
    SandboxExec,
    Gvisor,
    Firecracker,
    None,
}
