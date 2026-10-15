use clap::Args;
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct SensoryIngestCmd {
    /// Mission UUID supplied by the caller; this CLI does not authenticate it
    #[arg(long)]
    pub mission_id: String,
    /// JSON file containing {"sensor":..., ...} typed signal data
    #[arg(long)]
    pub input: PathBuf,
    /// Stable key reused for an exact retry; changed content is rejected
    #[arg(long)]
    pub replay_key: String,
    /// Acknowledge that this path has no authenticated mission authority
    #[arg(long, default_value_t = false)]
    pub experimental: bool,
}
