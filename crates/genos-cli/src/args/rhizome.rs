use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct RhizomeCmd {
    #[command(subcommand)]
    pub subcommand: Option<RhizomeSubcommands>,
}

#[derive(Subcommand, Debug)]
pub enum RhizomeSubcommands {
    /// Stream a persisted backend Rhizome graph over HTTP and WebSocket.
    Serve {
        /// Port to bind the telemetry HTTP/WebSocket server on
        #[arg(long, short = 'p', default_value_t = 4790)]
        port: u16,
        #[command(flatten)]
        source: RhizomeSource,
    },
    /// Export a persisted backend Rhizome graph as JSON
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
        #[command(flatten)]
        source: RhizomeSource,
    },
}

#[derive(Args, Debug)]
pub struct RhizomeSource {
    /// Identifier of the persisted backend session
    #[arg(long, requires = "database", conflicts_with = "simulate")]
    pub session_id: Option<String>,
    /// Existing SQLite database inside the GenOS workspace
    #[arg(long, requires = "session_id", conflicts_with = "simulate")]
    pub database: Option<String>,
    /// Use the explicitly labelled demonstration simulator
    #[arg(long, default_value_t = false)]
    pub simulate: bool,
}
