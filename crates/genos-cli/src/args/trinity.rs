use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct TrinityCmd {
    #[command(subcommand)]
    pub subcommand: TrinitySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum TrinitySubcommands {
    /// Deploy 3 counterfactual worlds in parallel
    Deploy {
        #[arg(long, default_value = "mission-bencode-parser")]
        mission_id: String,
        #[arg(long, default_value = "naive,planned,self_correcting")]
        strategies: String,
        /// Launch interactive real-time 3-column terminal TUI
        #[arg(long, short = 's')]
        split_screen: bool,
        /// Target prompt / engineering goal for Trinity execution
        #[arg(long, short = 'p')]
        prompt: Option<String>,
        /// Run in deterministic simulation demo mode
        #[arg(long, default_value_t = false)]
        simulation: bool,
    },
    /// Interactive real-time split-screen terminal TUI (3 worlds side-by-side)
    SplitScreen {
        #[arg(long, short = 'm', default_value = "mission-bencode-parser")]
        mission_id: String,
        /// Target prompt / engineering goal for Trinity execution
        #[arg(long, short = 'p')]
        prompt: Option<String>,
        /// Run in deterministic simulation demo mode
        #[arg(long, default_value_t = false)]
        simulation: bool,
    },
}
