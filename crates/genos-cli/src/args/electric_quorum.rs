use clap::Args;
use uuid::Uuid;

#[derive(Args, Debug)]
pub struct ElectricQuorumCmd {
    /// Mission UUID; this local CLI does not authenticate the mission caller
    #[arg(long)]
    pub mission_id: Uuid,
    /// Required tick from the restored mission population
    #[arg(long)]
    pub tick: u64,
    /// JSON vote request signed by its participants
    #[arg(long)]
    pub request: std::path::PathBuf,
    /// Acknowledge that this local path has no authenticated operator principal
    #[arg(long, default_value_t = false)]
    pub experimental: bool,
}
