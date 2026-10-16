pub mod biomimicry;
pub mod biological;
pub mod biology_extra;
pub mod store_extra;
pub mod subcommands;
pub mod trinity;
pub mod rhizome;
pub mod run;
pub mod chaos;
pub mod genome;
pub mod sensory;
pub mod metabolic;
pub mod guard_flux;
pub mod electric_quorum;
pub mod neuro_glia;

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
pub use genome::*;
pub use sensory::*;
pub use metabolic::*;
pub use guard_flux::*;
pub use electric_quorum::*;
pub use neuro_glia::*;

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
    /// Read-only Rust morphogenesis planning and governance gate
    MorphogenesisAdjudicate { payload: String },
    /// Read-only resolver proposals for a persisted post-mission signal
    MorphogenesisPropose { payload: String },
    /// Internal read-only verifier used by the live Rust control kernel
    #[command(name = "kernel-verify", hide = true)]
    KernelVerify { payload: String },
    /// Initialize the GenOS workspace directories
    Init,
    /// Check which local GenOS capabilities are available
    Doctor,
    /// Explain persisted evidence and morphology for a mission
    Explain { mission_id: String },
    /// Agent genome lifecycle operations
    Agent(AgentCmd),
    /// Binary AgentDNA genome operations
    Genome(GenomeCmd),
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
    /// EXPERIMENTAL: ingest a synthetic sensory signal without authenticated mission authority
    #[command(name = "sensory-ingest")]
    SensoryIngest(SensoryIngestCmd),
    /// Import a tenant- and principal-bound synthetic sensory receipt from the backend
    #[command(name = "sensory-backend-import")]
    SensoryBackendImport(SensoryBackendImportCmd),
    /// EXPERIMENTAL: consume a durable mission-scoped cell metabolic pool
    #[command(name = "metabolic-pool")]
    MetabolicPool(MetabolicPoolCmd),
    /// EXPERIMENTAL: run a mission-scoped guard-cell flux operation
    #[command(name = "guard-flux")]
    GuardFlux(GuardFluxCmd),
    /// EXPERIMENTAL: run a local signed electrocyte software quorum
    #[command(name = "electric-quorum")]
    ElectricQuorum(ElectricQuorumCmd),
    /// EXPERIMENTAL: append a host-authenticated local mission neuro-glia event
    #[command(name = "neuro-glia-stream")]
    NeuroGliaStream(NeuroGliaStreamCmd),
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
