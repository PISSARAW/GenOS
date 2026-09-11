use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct RhizomeCmd {
    #[command(subcommand)]
    pub subcommand: Option<RhizomeSubcommands>,
}

#[derive(Subcommand, Debug)]
pub enum RhizomeSubcommands {
    /// Start the real-time telemetry server: an in-memory G_t=(N_t,E_t) graph streamed live over
    /// WebSocket to a D3-rendered dashboard as the runtime grows and prunes capability nodes.
    Serve {
        /// Port to bind the telemetry HTTP/WebSocket server on
        #[arg(long, short = 'p', default_value_t = 4790)]
        port: u16,
    },
    /// Run one budding/contraction pass headlessly and export the resulting graph as JSON
    Export {
        /// Destination path for the exported graph JSON
        #[arg(long, short = 'o', default_value = "artifacts/rhizome_graph.json")]
        output: String,
        /// Overwrite the destination file when it already exists
        #[arg(long, default_value_t = false)]
        force: bool,
        /// Create missing parent directories
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
}
