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
    /// Cross two registered mission cells and persist their lineage receipt.
    #[arg(long, requires = "tick", requires_all = ["crossover_parent_b", "crossover_seed"], conflicts_with = "replay_crossover_key")]
    pub crossover_parent_a: Option<uuid::Uuid>,
    /// Second registered mission cell for an authorized crossover request.
    #[arg(long, requires = "tick", requires_all = ["crossover_parent_a", "crossover_seed"], conflicts_with = "replay_crossover_key")]
    pub crossover_parent_b: Option<uuid::Uuid>,
    /// Deterministic seed for the requested mission crossover.
    #[arg(long, requires = "tick", requires_all = ["crossover_parent_a", "crossover_parent_b"], conflicts_with = "replay_crossover_key")]
    pub crossover_seed: Option<u64>,
    /// Restore a previously authorized crossover by its durable idempotency key.
    #[arg(long, requires = "tick", conflicts_with_all = ["crossover_parent_a", "crossover_parent_b", "crossover_seed"])]
    pub replay_crossover_key: Option<String>,
    /// JSON typed signal stream to filter and persist under the runtime producer identity.
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
