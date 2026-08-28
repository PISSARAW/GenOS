use super::ArgsMacro;

#[derive(ArgsMacro, Debug)]
pub struct SwarmCommand {
    #[command(subcommand)]
    pub command: SwarmSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum SwarmSubcommands {
    /// Analyzes allele frequencies fleet-wide and identifies beneficial or lethal alleles.
    AlleleAnalyzer(AlleleAnalyzerArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct AlleleAnalyzerArgs {
    #[arg(long)]
    pub swarm_id: String,
}
