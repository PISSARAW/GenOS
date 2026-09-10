use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct RhizomeCmd {
    #[command(subcommand)]
    pub subcommand: Option<RhizomeSubcommands>,
}

#[derive(Subcommand, Debug)]
pub enum RhizomeSubcommands {
    /// Launch interactive visual simulation of graph budding and contraction
    Visualize {
        /// Optional path to export animated GIF
        #[arg(long)]
        gif: Option<String>,
    },
    /// Export animated GIF of Rhizome budding simulation
    Gif {
        /// Destination path for generated animated GIF
        #[arg(long, short = 'o', default_value = "artifacts/rhizome_simulation.gif")]
        output: String,
    },
}
