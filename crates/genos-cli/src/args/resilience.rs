use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct ResilienceCommand {
    #[command(subcommand)]
    pub command: ResilienceSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum ResilienceSubcommands {
    /// Gracefully shutdown an agent to prevent state corruption (Apoptosis).
    Apoptosis(ApoptosisArgs),
    /// Put the environment in offline stasis mode (Cryptobiosis).
    Cryptobiosis(CryptobiosisArgs),
    /// Trigger hypermutation fuzzing on a target.
    Hypermutation(HypermutationArgs),
    /// Cut off a runaway counterfactual branch.
    CircuitBreaker(CircuitBreakerArgs),
    /// Evaluate viral-dynamics triggers for an agent's current stress level.
    ViralStatus(ViralStatusArgs),
    /// Plan a deterministic lytic burst of divergent clones.
    Burst(BurstArgs),
    /// Integrate a skill cassette into a genome's prophage locus.
    CassetteIntegrate(CassetteIntegrateArgs),
    /// Induce dormant prophage cassettes when stress crosses the threshold.
    CassetteInduce(CassetteInduceArgs),
    /// Assemble a transduction capsule and test it against a recipient lineage.
    Transduce(TransduceArgs),
    /// Deploy a virophage into a honeypot session (confirmed antigen).
    VirophageDeploy(VirophageDeployArgs),
    /// Feed one attacker playbook iteration to the session's virophage.
    VirophageObserve(VirophageObserveArgs),
    /// Sterilize a honeypot session and report harvested attack genes.
    VirophageHarvest(VirophageHarvestArgs),
}

#[derive(clap::Args, Debug)]
pub struct ApoptosisArgs {
    #[arg(long)]
    pub agent_id: String,
}

#[derive(clap::Args, Debug)]
pub struct CryptobiosisArgs {
    #[arg(long)]
    pub mode: String,
    /// File whose bytes are frozen into the spore.
    #[arg(long, conflicts_with = "state_data", value_name = "PATH")]
    pub state_file: Option<PathBuf>,
    /// Literal state payload frozen into the spore.
    #[arg(long, value_name = "DATA")]
    pub state_data: Option<String>,
}

#[derive(clap::Args, Debug)]
pub struct HypermutationArgs {
    #[arg(long)]
    pub target: String,
}

#[derive(clap::Args, Debug)]
pub struct CircuitBreakerArgs {
    #[arg(long)]
    pub branch_id: String,
    /// Number of consecutive failures to feed the breaker.
    #[arg(long, default_value_t = 3)]
    pub failures: u32,
    /// Failure count at which the breaker opens.
    #[arg(long, default_value_t = 3)]
    pub threshold: u32,
}

#[derive(clap::Args, Debug)]
pub struct ViralStatusArgs {
    #[arg(long)]
    pub agent_id: String,
    /// Consecutive failures reported by the agent loop.
    #[arg(long, default_value_t = 0)]
    pub failures: u32,
    /// Normalized progress in [0, 1] (passing test ratio, AST resolution...).
    #[arg(long, default_value_t = 1.0)]
    pub progress: f32,
    /// Directory holding the cassette registry (defaults to .genos/viral).
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct BurstArgs {
    #[arg(long)]
    pub genome_id: String,
    /// Number of divergent clones to spawn (capped by the error-threshold
    /// guard computed from --info-length/--w-max/--w-avg).
    #[arg(long, default_value_t = 5)]
    pub clones: usize,
    /// Cloud width around the master sequence.
    #[arg(long, default_value_t = 0.4)]
    pub sigma: f32,
    /// Deterministic burst seed; same seed replays identical clones.
    #[arg(long, default_value_t = 42)]
    pub seed: u64,
    #[arg(long, default_value_t = 4.0)]
    pub info_length: f32,
    #[arg(long, default_value_t = 2.0)]
    pub w_max: f32,
    #[arg(long, default_value_t = 1.0)]
    pub w_avg: f32,
}

#[derive(clap::Args, Debug)]
pub struct CassetteIntegrateArgs {
    #[arg(long)]
    pub genome_id: String,
    #[arg(long)]
    pub cassette_id: String,
    /// Winning strategy delta to store at the prophage locus.
    #[arg(long)]
    pub payload: String,
    /// Failure-mode embedding of the context that produced this cassette.
    #[arg(long = "signature", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub signature: Vec<f32>,
    /// Directory holding the cassette registry (defaults to .genos/viral).
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct CassetteInduceArgs {
    #[arg(long)]
    pub genome_id: String,
    #[arg(long, default_value_t = 3)]
    pub failures: u32,
    #[arg(long, default_value_t = 0.5)]
    pub progress: f32,
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct TransduceArgs {
    #[arg(long)]
    pub capsule_id: String,
    #[arg(long)]
    pub from_genome: String,
    /// Strategy delta being offered to the recipient lineage.
    #[arg(long)]
    pub payload: String,
    /// Failure-mode embedding used for exclusion and negative selection.
    #[arg(long = "signature", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub signature: Vec<f32>,
    /// Hash of the sandboxed evaluation artifact proving the payload works.
    #[arg(long = "proof-hash")]
    pub evaluation_proof_hash: String,
    /// Recipient's benign self-corpus embeddings for negative selection.
    #[arg(long = "self-sig", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub self_signature: Vec<f32>,
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct VirophageDeployArgs {
    #[arg(long)]
    pub session_id: String,
    /// Signature of the confirmed attacker source; reuse routes to the same
    /// open honeypot session.
    #[arg(long)]
    pub source_signature: String,
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct VirophageObserveArgs {
    #[arg(long)]
    pub session_id: String,
    /// Hash of the playbook variant observed in this iteration.
    #[arg(long)]
    pub gene_hash: String,
    /// Embedding of the observed attack gene.
    #[arg(long = "embedding", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub embedding: Vec<f32>,
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct VirophageHarvestArgs {
    #[arg(long)]
    pub session_id: String,
    #[arg(long, default_value = ".genos/viral")]
    pub root: PathBuf,
}

#[derive(clap::Args, Debug)]
pub struct AisNegativeScreenArgs {
    /// Candidate detector values (one float per candidate).
    #[arg(long = "candidate", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub candidate: Vec<f32>,
    /// Benign self-corpus embeddings (one float per self sample).
    #[arg(long = "self-sig", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub self_sig: Vec<f32>,
    #[arg(long, default_value_t = 8.0)]
    pub gamma: f32,
    /// Affinity above which a candidate is self-reactive and eliminated.
    #[arg(long, default_value_t = 0.7)]
    pub theta_self: f32,
}

#[derive(clap::Args, Debug)]
pub struct AisClonalHypermutateArgs {
    #[arg(long)]
    pub antibody_id: String,
    /// Antibody centroid embedding.
    #[arg(long = "centroid", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub centroid: Vec<f32>,
    /// Antigen embedding.
    #[arg(long = "antigen", value_name = "FLOAT", num_args = 1.., value_delimiter = ' ')]
    pub antigen: Vec<f32>,
    #[arg(long, default_value_t = 8.0)]
    pub gamma: f32,
    #[arg(long, default_value_t = 0.6)]
    pub theta_threat: f32,
    /// Number of clones per expansion round.
    #[arg(long, default_value_t = 16)]
    pub clone_factor: u32,
    /// Somatic hypermutation sigma.
    #[arg(long, default_value_t = 0.08)]
    pub mutation_sigma: f32,
    /// Deterministic seed for clone expansion.
    #[arg(long, default_value_t = 42)]
    pub seed: u64,
}

#[derive(clap::Args, Debug)]
pub struct AisDangerTelemetryArgs {
    #[arg(long, default_value_t = 0)]
    pub failures: u32,
    #[arg(long, default_value_t = 0.0)]
    pub semantic_divergence: f32,
    #[arg(long, default_value_t = 0)]
    pub context_pollution: u32,
    #[arg(long, default_value_t = 0.0)]
    pub cost_overrun: f32,
    #[arg(long, default_value_t = false)]
    pub invariant_breach: bool,
    #[arg(long, default_value_t = 0.5)]
    pub damp_threshold: f32,
}
