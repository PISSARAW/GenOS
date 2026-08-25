use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser, Debug)]
pub struct BiomimicryCommand {
    #[command(subcommand)]
    pub command: BiomimicrySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum BiomimicrySubcommands {
    /// Trigger swarm consensus evaluation.
    SwarmConsensus(SwarmConsensusArgs),
    /// Launch a boids-based heuristic exploration.
    FlockingExplore(FlockingExploreArgs),
    /// Evaluate network quorum state.
    NetworkQuorum(NetworkQuorumArgs),
    /// Sync a distributed huddle state.
    DistributedHuddle(DistributedHuddleArgs),
    /// Run a biomimicry feature module action (generic entry point).
    BioFeature(BioFeatureArgs),
}

/// Generic entry point for biomimicry feature modules. Each feature exposes
/// typed actions and consumes `key=value` parameters, so new features wire
/// in without touching the CLI dispatch table again.
#[derive(clap::Args, Debug)]
pub struct BioFeatureArgs {
    /// Feature module (gate | chaperone | vaccination | interferon | sar | mutualism | reciprocity | proceduralization).
    #[arg(long)]
    pub feature: String,
    /// Action within the feature module.
    #[arg(long)]
    pub action: String,
    /// Feature parameter as key=value (repeatable).
    #[arg(long = "param")]
    pub params: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum VoteKind {
    Explore,
    Exploit,
    Rest,
}

#[derive(clap::Args, Debug)]
pub struct SwarmConsensusArgs {
    #[arg(long)]
    pub target: String,
    /// Cast a vote. Repeat to tally a quorum.
    #[arg(long = "vote", value_enum, required = true)]
    pub votes: Vec<VoteKind>,
}

#[derive(clap::Args, Debug)]
pub struct FlockingExploreArgs {
    #[arg(long)]
    pub area: String,
    /// Cohesion steps to simulate.
    #[arg(long, default_value_t = 2)]
    pub steps: usize,
    #[arg(long, default_value_t = 0.0)]
    pub x: f32,
    #[arg(long, default_value_t = 0.0)]
    pub y: f32,
}

#[derive(clap::Args, Debug)]
pub struct NetworkQuorumArgs {
    #[arg(long)]
    pub node: String,
    /// Local signal density sensed by the node.
    #[arg(long, default_value_t = 50)]
    pub signal: u32,
    /// Activation threshold the signal must reach.
    #[arg(long, default_value_t = 80)]
    pub threshold: u32,
}

#[derive(clap::Args, Debug)]
pub struct DistributedHuddleArgs {
    #[arg(long)]
    pub state_file: String,
}
