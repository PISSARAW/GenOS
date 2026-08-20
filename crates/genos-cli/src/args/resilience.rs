use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
pub struct ResilienceCommand {
    #[command(subcommand)]
    pub command: ResilienceSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum ResilienceSubcommands {
    /// Gracefully shutdown an agent to prevent state corruption (Apoptosis).
    Apoptosis(ApoptosisArgs),
    /// Put the environment in offline stasis mode (Cryptobiosis).
    Cryptobiosis(CryptobiosisArgs),
    /// Trigger hypermutation fuzzing on a target.
    Hypermutation(HypermutationArgs),
    /// Cut off a runaway counterfactual branch.
    CircuitBreaker(CircuitBreakerArgs),
}

#[derive(clap::Args, Debug)]
pub struct ApoptosisArgs {
    #[arg(long)]
    pub agent_id: String,
}

#[derive(clap::Args, Debug)]
pub struct CryptobiosisArgs {
    #[arg(long)]
    pub mode: String,
}

#[derive(clap::Args, Debug)]
pub struct HypermutationArgs {
    #[arg(long)]
    pub target: String,
}

#[derive(clap::Args, Debug)]
pub struct CircuitBreakerArgs {
    #[arg(long)]
    pub branch_id: String,
}
