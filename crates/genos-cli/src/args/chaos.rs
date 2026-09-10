use clap::Args;

/// Injects chaos by terminating a worker agent process (PID) to verify
/// that the Regeneration Steward reconstructs the population from lineage (L_i).
#[derive(Args, Debug)]
pub struct InjectChaosCmd {
    /// Target worker agent ID to kill (picks a random active worker if omitted).
    #[arg(short = 't', long)]
    pub target: Option<String>,

    /// Specific worker PID to target directly.
    #[arg(short = 'p', long)]
    pub pid: Option<u32>,

    /// Chaos injection mode: kill-worker, disconnect, or corrupt-tokens.
    #[arg(long, default_value = "kill-worker")]
    pub mode: String,

    /// Preview the chaos plan and lineage L_i without terminating any process.
    #[arg(long)]
    pub dry_run: bool,

    /// Workspace ID scope for the chaos experiment.
    #[arg(long)]
    pub workspace_id: Option<String>,

    /// Fleet or mission ID scope.
    #[arg(long)]
    pub fleet_id: Option<String>,

    /// Reason or drill identifier.
    #[arg(long, default_value = "Chaos Engineering Survival Test")]
    pub reason: String,
}
