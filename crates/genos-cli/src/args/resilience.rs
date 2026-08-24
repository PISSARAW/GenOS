use clap::{Parser, Subcommand};
use std::path::PathBuf;

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
    /// File whose bytes are frozen into the spore.
    #[arg(long, conflicts_with = "state_data", value_name = "PATH")]
    pub state_file: Option<PathBuf>,
    /// Literal state payload frozen into the spore.
    #[arg(long, value_name = "DATA")]
    pub state_data: Option<String>,
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
    /// Number of consecutive failures to feed the breaker.
    #[arg(long, default_value_t = 3)]
    pub failures: u32,
    /// Failure count at which the breaker opens.
    #[arg(long, default_value_t = 3)]
    pub threshold: u32,
}
