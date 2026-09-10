use clap::Args;

/// `genos run --mode trinity --monitor` launches the native TUI monitor that
/// attaches to a live Trinity mission over the `trinityMonitorServer.js`
/// NDJSON socket, mapping the 3 isolated worlds and the evidence barrier onto
/// the ratatui split-screen.
#[derive(Args, Debug)]
pub struct RunCmd {
    /// Execution mode to run. Currently supports: trinity
    #[arg(long, default_value = "trinity")]
    pub mode: String,
    /// Attach the native TUI monitor to a live mission instead of running the
    /// scripted demo narrative.
    #[arg(long)]
    pub monitor: bool,
    /// Mission id to subscribe to. Defaults to the most recently deployed mission.
    #[arg(long)]
    pub mission_id: Option<String>,
    /// Trinity monitor server host (see GENOS_TRINITY_MONITOR_PORT on the backend).
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    /// Trinity monitor server TCP port.
    #[arg(long, default_value_t = 4590)]
    pub port: u16,
    /// Target prompt / engineering goal, used only when --monitor is not set (demo mode).
    #[arg(long, short = 'p')]
    pub prompt: Option<String>,
}
