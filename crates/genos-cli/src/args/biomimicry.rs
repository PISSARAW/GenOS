use clap::{Parser, Subcommand};

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
}

#[derive(clap::Args, Debug)]
pub struct SwarmConsensusArgs {
    #[arg(long)]
    pub target: String,
}

#[derive(clap::Args, Debug)]
pub struct FlockingExploreArgs {
    #[arg(long)]
    pub area: String,
}

#[derive(clap::Args, Debug)]
pub struct NetworkQuorumArgs {
    #[arg(long)]
    pub node: String,
}

#[derive(clap::Args, Debug)]
pub struct DistributedHuddleArgs {
    #[arg(long)]
    pub state_file: String,
}
