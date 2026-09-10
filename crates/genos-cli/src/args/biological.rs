use clap::Args;

#[derive(Args, Debug)]
pub struct BiologicalCmd {
    /// Biological organization mode.
    #[arg(long, default_value = "rhizome")]
    pub mode: String,
    /// Mission shared by the collective.
    #[arg(long, default_value = "explore_api_boundary")]
    pub mission: String,
    /// Launch interactive visual simulation of graph budding and contraction
    #[arg(long, short = 'v')]
    pub visualize: bool,
    /// Export animated GIF of Rhizome budding simulation to file
    #[arg(long)]
    pub gif: Option<String>,
}