//! Domaine natif borné sans shell ni accès fichiers dans le worker.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerRole { Producer, VerifierA, VerifierB }

impl WorkerRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Producer => "producer",
            Self::VerifierA => "verifier_a",
            Self::VerifierB => "verifier_b",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Computation {
    pub source_hash: String,
    pub sum: i64,
    pub count: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerJob {
    pub schema: String,
    pub binding_digest: String,
    pub operation_id: String,
    pub worker_id: String,
    pub role: WorkerRole,
    pub nonce: String,
    pub source_hash: String,
    pub context_hash: String,
    pub env_hash: String,
    pub policy_hash: String,
    pub input: Vec<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerReply {
    pub schema: String,
    pub binding_digest: String,
    pub operation_id: String,
    pub worker_id: String,
    pub role: WorkerRole,
    pub nonce: String,
    pub context_hash: String,
    pub env_hash: String,
    pub policy_hash: String,
    pub process_id: u32,
    pub result: Computation,
}


pub fn execute(job: &WorkerJob) -> Result<WorkerReply, String> {
    validate(&job.input)?;
    if job.schema != "genos.rust-worker-job/v1" { return Err("unsupported native job".into()); }
    let sum = match job.role {
        WorkerRole::Producer => job.input.iter().try_fold(0i64, |sum, value| sum.checked_add(*value).ok_or("sum overflow"))?,
        WorkerRole::VerifierA => reverse_sum(&job.input)?,
        WorkerRole::VerifierB => counted_sum(&job.input)?,
    };
    Ok(WorkerReply {
        schema: "genos.rust-worker-reply/v1".into(), binding_digest: job.binding_digest.clone(),
        operation_id: job.operation_id.clone(), worker_id: job.worker_id.clone(), role: job.role,
        nonce: job.nonce.clone(), context_hash: job.context_hash.clone(), env_hash: job.env_hash.clone(),
        policy_hash: job.policy_hash.clone(), process_id: std::process::id(),
        result: Computation { source_hash: job.source_hash.clone(), sum, count: job.input.len() as u64 },
    })
}

pub fn validate(input: &[i64]) -> Result<(), String> {
    if input.is_empty() || input.len() > 4096 || input.iter().any(|n| !(-1_000_000..=1_000_000).contains(n)) {
        return Err("integer_sum requires 1..4096 integers between -1000000 and 1000000".into());
    }
    Ok(())
}

fn reverse_sum(input: &[i64]) -> Result<i64, String> {
    let mut sum = 0i128;
    for index in (0..input.len()).rev() { sum += i128::from(input[index]); }
    i64::try_from(sum).map_err(|_| "verifier sum overflow".into())
}

fn counted_sum(input: &[i64]) -> Result<i64, String> {
    let mut counts = std::collections::BTreeMap::<i64, i64>::new();
    for value in input { *counts.entry(*value).or_default() += 1; }
    let sum = counts.into_iter().map(|(value, count)| i128::from(value) * i128::from(count)).sum::<i128>();
    i64::try_from(sum).map_err(|_| "counted verifier sum overflow".into())
}
