use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct GenomeCmd {
    #[command(subcommand)]
    pub subcommand: GenomeSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum GenomeSubcommands {
    /// Compile a portable AgentGenome manifest into a binary AgentDNA genome
    Compile {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Validate a binary AgentDNA genome
    Validate {
        #[arg(long)]
        file: String,
    },
    /// Inspect a binary AgentDNA genome
    Inspect {
        #[arg(long)]
        file: String,
    },
}
