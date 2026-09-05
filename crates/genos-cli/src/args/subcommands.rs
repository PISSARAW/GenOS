use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct AgentCmd {
    #[command(subcommand)]
    pub subcommand: AgentSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum AgentSubcommands {
    Create {
        #[arg(long)]
        name: String,
        #[arg(long, default_value = "worker")]
        role: String,
        #[arg(long)]
        out: String,
    },
    Mutate {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        r#trait: String,
        #[arg(long, default_value_t = 1.0)]
        outcome: f64,
    },
    Prune {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value_t = 0.5)]
        threshold: f64,
    },
    Fork {
        #[arg(long)]
        parent_id: Option<String>,
    },
}

#[derive(Args, Debug)]
pub struct SnapshotCmd {
    #[command(subcommand)]
    pub subcommand: SnapshotSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum SnapshotSubcommands {
    Create {
        #[arg(long)]
        agent: String,
        #[arg(long)]
        out: String,
    },
    List,
}

#[derive(Args, Debug)]
pub struct DiffCmd {
    pub a: String,
    pub b: String,
}

#[derive(Args, Debug)]
pub struct HallucinationCmd {
    #[command(subcommand)]
    pub subcommand: HallucinationSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum HallucinationSubcommands {
    Detect {
        #[arg(long)]
        snapshot: String,
    },
    Analyze {
        #[arg(long)]
        snapshot: String,
    },
    Extract {
        #[arg(long)]
        snapshot: String,
    },
    Simulate {
        #[arg(long, default_value = "default")]
        model: String,
        #[arg(long)]
        snapshot: String,
    },
}

#[derive(Args, Debug)]
pub struct ReplayCmd {
    #[command(subcommand)]
    pub subcommand: ReplaySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum ReplaySubcommands {
    Basic {
        #[arg(long)]
        snapshot: String,
    },
}

#[derive(Args, Debug)]
pub struct CapsuleCmd {
    #[command(subcommand)]
    pub subcommand: CapsuleSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum CapsuleSubcommands {
    Create {
        #[arg(long)]
        snapshot: String,
        #[arg(long)]
        seed: Option<String>,
        #[arg(long)]
        budget_steps: Option<u32>,
    },
}

#[derive(Args, Debug)]
pub struct AuditCmd {
    pub snapshot_id: String,
    #[arg(long)]
    pub output: Option<String>,
}

#[derive(Args, Debug)]
pub struct MergeCmd {
    pub branch_id: String,
    #[arg(long)]
    pub conditions: Option<String>,
}

#[derive(Args, Debug)]
pub struct CostAccountingCmd {
    pub agent_id: String,
    #[arg(long)]
    pub timeframe: Option<String>,
}

#[derive(Args, Debug)]
pub struct LoopDetectionCmd {
    #[arg(long)]
    pub history_file: String,
    #[arg(long, default_value_t = 3)]
    pub exact_match: usize,
    #[arg(long, default_value_t = 5)]
    pub stagnation: usize,
    #[arg(long, default_value_t = 0.95)]
    pub similarity: f64,
}

#[derive(Args, Debug)]
pub struct CausalityCmd {
    #[command(subcommand)]
    pub subcommand: CausalitySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum CausalitySubcommands {
    Fork {
        #[arg(long)]
        boundary_id: String,
        #[arg(long)]
        new_boundary_id: String,
    },
}

#[derive(Args, Debug)]
pub struct ExperimentCmd {
    #[command(subcommand)]
    pub subcommand: ExperimentSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum ExperimentSubcommands {
    CausalReplay {
        input_file: String,
    },
    Incident {
        manifest: String,
    },
    BugInvestigation {
        manifest: String,
    },
}

#[derive(Args, Debug)]
pub struct PhenotypeCmd {
    #[command(subcommand)]
    pub subcommand: PhenotypeSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum PhenotypeSubcommands {
    MeasureDivergence {
        #[arg(long)]
        trait_name: String,
        #[arg(long)]
        expected: f64,
        #[arg(long)]
        observed: f64,
        #[arg(long)]
        tolerance: f64,
    },
}

#[derive(Args, Debug)]
pub struct TrinityCmd {
    #[command(subcommand)]
    pub subcommand: TrinitySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum TrinitySubcommands {
    Deploy {
        #[arg(long)]
        mission_id: String,
        #[arg(long)]
        strategies: String,
    },
}

#[derive(Args, Debug)]
pub struct SwarmCmd {
    #[command(subcommand)]
    pub subcommand: SwarmSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum SwarmSubcommands {
    AlleleAnalyzer {
        #[arg(long)]
        swarm_id: String,
    },
}

#[derive(Args, Debug)]
pub struct ComplianceCmd {
    #[command(subcommand)]
    pub subcommand: ComplianceSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum ComplianceSubcommands {
    Generate {
        #[arg(long)]
        standard: String,
        #[arg(long)]
        output_file: Option<String>,
    },
}

#[derive(Args, Debug)]
pub struct StrategyCmd {
    #[command(subcommand)]
    pub subcommand: StrategySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum StrategySubcommands {
    Adapt {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        constraint: String,
        #[arg(long)]
        target: f64,
    },
}

#[derive(Args, Debug)]
pub struct RebaseCmd {
    #[command(subcommand)]
    pub subcommand: RebaseSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum RebaseSubcommands {
    ComputePlan {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

#[derive(Args, Debug)]
pub struct WorldCmd {
    #[command(subcommand)]
    pub subcommand: WorldSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum WorldSubcommands {
    Create {
        #[arg(long)]
        provider: String,
        #[arg(long)]
        root: String,
        #[arg(long)]
        world_id: String,
        #[arg(long)]
        seed: Option<String>,
    },
    Run {
        #[arg(long)]
        provider: String,
        #[arg(long)]
        root: String,
        #[arg(long)]
        world_id: String,
        #[arg(long)]
        command: String,
        #[arg(long)]
        sandbox_backend: String,
    },
}

#[derive(Args, Debug)]
pub struct PlatformCmd {
    #[command(subcommand)]
    pub subcommand: PlatformSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum PlatformSubcommands {
    Ingest {
        document: String,
        #[arg(long)]
        index: Option<String>,
    },
    Search {
        query: String,
        #[arg(long)]
        index: Option<String>,
    },
}
