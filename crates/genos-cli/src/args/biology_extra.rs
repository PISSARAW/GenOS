use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct ResilienceCmd {
    #[command(subcommand)]
    pub subcommand: ResilienceSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum ResilienceSubcommands {
    Cryptobiosis {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        duration: Option<u64>,
    },
}

#[derive(Args, Debug)]
pub struct AisCmd {
    #[command(subcommand)]
    pub subcommand: AisSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum AisSubcommands {
    DangerTelemetry {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        severity: String,
        #[arg(long)]
        threat_context: String,
    },
    ClonalHypermutate {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        mutation_rate: f64,
        #[arg(long)]
        clone_count: u32,
    },
    PrrScan {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        patterns: String,
    },
}

#[derive(Args, Debug)]
pub struct SynapticCmd {
    #[command(subcommand)]
    pub subcommand: SynapticSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum SynapticSubcommands {
    PruneScale {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        scale: f64,
    },
    PathEvaluate {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        pre_node: String,
        #[arg(long)]
        post_node: String,
    },
}
