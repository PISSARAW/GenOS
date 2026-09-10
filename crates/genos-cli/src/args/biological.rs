use clap::Args;

#[derive(Args, Debug)]
pub struct BiologicalCmd {
    /// Biological organization mode.
    #[arg(long)]
    pub mode: String,
    /// Mission shared by the collective.
    #[arg(long)]
    pub mission: String,
}