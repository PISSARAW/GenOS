pub mod biomimicry;
pub mod biological;
pub mod biology_extra;
pub mod store_extra;
pub mod subcommands;
pub mod trinity;
pub mod rhizome;
pub mod run;
pub mod chaos;
pub mod quantum_vfs;

use clap::{Parser, Subcommand};
pub use biomimicry::*;
pub use biological::*;
pub use biology_extra::*;
pub use store_extra::*;
pub use subcommands::*;
pub use trinity::*;
pub use rhizome::*;
pub use run::*;
pub use chaos::*;
pub use quantum_vfs::*;

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
    /// Initialize the GenOS workspace directories
    Init,
    /// Quantum Virtual File System (7-pillar quantum coherence) operations
    QuantumVfs(QuantumVfsCmd),
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
    Biomimicry(Box<BiomimicryCmd>),
    /// Evolutionary operations
    Evolution(Box<EvolutionCmd>),
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
    /// Biological collective deployment
    Biological(BiologicalCmd),
    /// Rhizome dynamic graph collective and visualization
    Rhizome(RhizomeCmd),
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
    /// System control commands
    Desktop(DesktopCmd),
    /// Unified execution entrypoint (e.g. `genos run --mode trinity --monitor`)
    Run(RunCmd),
    /// Inject chaos by terminating a worker PID to test Regeneration Steward recovery
    #[command(name = "inject-chaos")]
    InjectChaos(InjectChaosCmd),
    /// Chaos engineering drills
    Chaos(InjectChaosCmd),
}
