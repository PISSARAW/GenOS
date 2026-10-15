use clap::Args;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Args, Debug)]
pub struct NeuroGliaStreamCmd {
    /// Mission UUID; the CLI does not authenticate this identity
    #[arg(long)]
    pub mission_id: Uuid,
    /// Event type that triggers the mission neuro-glia response
    #[arg(long)]
    pub event_type: String,
    /// JSON payload file for the event
    #[arg(long)]
    pub payload: PathBuf,
    /// Tick recorded for this event
    #[arg(long)]
    pub tick: u64,
    /// Stable key reused for an exact retry
    #[arg(long)]
    pub idempotency_key: String,
    /// Ed25519 producer identity, registered in host bootstrap trust
    #[arg(long)]
    pub producer_id: Uuid,
    /// Hex Ed25519 signature over mission, tick, producer and payload digest
    #[arg(long)]
    pub signature_hex: String,
    /// Optional backend-signed principal and tenant authorization proof JSON
    #[arg(long)]
    pub backend_proof: Option<PathBuf>,
    /// Require backend principal/scope proof for this append and the existing stream
    #[arg(long, default_value_t = false)]
    pub require_backend_authorization: bool,
    /// Acknowledge this local path has no authenticated mission principal
    #[arg(long, default_value_t = false)]
    pub experimental: bool,
}
