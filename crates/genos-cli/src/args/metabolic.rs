use clap::Args;
use uuid::Uuid;

#[derive(Args, Debug)]
pub struct MetabolicPoolCmd {
    /// Mission UUID; the CLI does not authenticate this identity
    #[arg(long)]
    pub mission_id: Uuid,
    /// Active cell whose amino-acid reserve will be consumed
    #[arg(long)]
    pub cell_id: Uuid,
    /// Stable key reused for an exact retry
    #[arg(long)]
    pub idempotency_key: String,
    /// Biological operation requesting the material
    #[arg(long)]
    pub operation: String,
    /// Amino-acid quantity requested from the cell pool
    #[arg(long)]
    pub amino_acids: f64,
    /// Mission receipt tick associated with this operation
    #[arg(long)]
    pub tick: u64,
    /// Acknowledge this local CLI path has no authenticated mission principal
    #[arg(long, default_value_t = false)]
    pub experimental: bool,
}
