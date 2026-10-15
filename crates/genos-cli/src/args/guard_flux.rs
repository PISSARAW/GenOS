use clap::Args;

#[derive(Args, Debug)]
pub struct GuardFluxCmd {
    /// Mission UUID supplied by the caller; this CLI does not authenticate it
    #[arg(long)]
    pub mission_id: String,
    /// Mission receipt tick associated with this flux operation
    #[arg(long)]
    pub tick: u64,
    /// Requested resource flux
    #[arg(long)]
    pub requested_flux: f64,
    /// Stable key reused for an exact retry
    #[arg(long)]
    pub idempotency_key: String,
    /// Acknowledge this local CLI path has no authenticated mission principal
    #[arg(long, default_value_t = false)]
    pub experimental: bool,
}
