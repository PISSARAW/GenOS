use clap::Args;

#[derive(Args, Debug)]
pub struct BiologicalCmd {
    /// Biological organization mode.
    #[arg(long, default_value = "rhizome")]
    pub mode: String,
    /// Mission shared by the collective.
    #[arg(long, default_value = "explore_api_boundary")]
    pub mission: String,
    /// Start the real-time Rhizome graph telemetry server and WebSocket dashboard
    #[arg(long, short = 's')]
    pub serve: bool,
    /// Port to bind the Rhizome telemetry HTTP/WebSocket server on
    #[arg(long, default_value_t = 4790)]
    pub port: u16,
}