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
    /// Execute and persist one real Rust biological mission tick.
    #[arg(long, default_value_t = false)]
    pub tick: bool,
    /// Also attempt one mission-scoped cell division and persist its lineage receipt.
    #[arg(long, requires = "tick", default_value_t = false)]
    pub divide: bool,
    /// Reproduce once after the persisted mission tick and archive the genome lineage.
    #[arg(long, requires = "tick", default_value_t = false)]
    pub reproduce: bool,
    /// JSON typed signal stream to filter and persist with its declared producer identity.
    #[arg(long, requires = "tick")]
    pub choanocyte_stream: Option<std::path::PathBuf>,
    /// Stable Rust UUID assigned to the backend mission.
    #[arg(long)]
    pub mission_id: Option<uuid::Uuid>,
    /// Recruit one validated AgentDNA genome after the persisted mission tick.
    #[arg(long, requires = "recruitment_spec")]
    pub recruit_dna: Option<std::path::PathBuf>,
    /// JSON file with an explicit tissue, demand, and candidate cost.
    #[arg(long, requires = "recruit_dna")]
    pub recruitment_spec: Option<std::path::PathBuf>,
}
