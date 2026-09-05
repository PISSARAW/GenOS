pub mod biomimicry;
pub mod biology_extra;
pub mod store_extra;
pub mod subcommands;

use clap::{Parser, Subcommand};
pub use biomimicry::*;
pub use biology_extra::*;
pub use store_extra::*;
pub use subcommands::*;

#[derive(Parser, Debug)]
#[command(name = "genos")]
#[command(author = "GenOS Team")]
#[command(version = "3.0.0")]
#[command(about = "GenOS Autonomous & Biomimetic OS CLI", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Agent genome lifecycle operations
    Agent(AgentCmd),
    /// Snapshot lifecycle operations
    Snapshot(SnapshotCmd),
    /// Diff two snapshots or states
    Diff(DiffCmd),
    /// Hallucination analysis and detection
    Hallucination(HallucinationCmd),
    /// Replay operations
    Replay(ReplayCmd),
    /// Biomimetic cellular & swarm mechanisms
    Biomimicry(BiomimicryCmd),
    /// Evolutionary operations
    Evolution(EvolutionCmd),
    /// Capsule isolation environment
    Capsule(CapsuleCmd),
    /// Audit report generation
    Audit(AuditCmd),
    /// Safe merge of branches
    Merge(MergeCmd),
    /// Cost accounting operations
    CostAccounting(CostAccountingCmd),
    /// Loop and stagnation detection
    LoopDetection(LoopDetectionCmd),
    /// Causality and branching operations
    Causality(CausalityCmd),
    /// Scientific counterfactual experiments
    Experiment(ExperimentCmd),
    /// Phenotype measurement
    Phenotype(PhenotypeCmd),
    /// Trinity multi-world deployment
    Trinity(TrinityCmd),
    /// Swarm telemetry and analysis
    Swarm(SwarmCmd),
    /// Compliance report generation
    Compliance(ComplianceCmd),
    /// Strategy adaptation
    Strategy(StrategyCmd),
    /// Rebase compute plan
    Rebase(RebaseCmd),
    /// World capsule management
    World(WorldCmd),
    /// Platform RAG operations
    Platform(PlatformCmd),
    /// Resilience operations
    Resilience(ResilienceCmd),
    /// Artificial Immune System operations
    Ais(AisCmd),
    /// Synaptic operations
    Synaptic(SynapticCmd),
    /// Stratigraphic paleontological fossil registry
    Fossil(FossilCmd),
    /// OpenAI-compatible REST API server
    Serve(ServeCmd),
}
