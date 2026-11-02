use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Binding {
    pub mission_id: String,
    pub run_id: String,
    pub actor_id: String,
    pub workspace: String,
    pub generation: u64,
    pub policy_hash: String,
    pub request_hash: String,
    pub env_hash: String,
    pub expires_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunSpec {
    pub mission_id: String,
    pub workspace: PathBuf,
    pub objective: String,
    pub input_path: String,
    pub expected_sum: Option<i64>,
    pub timeout_ms: u64,
    pub env_hash: String,
}

pub struct Event {
    pub protocol: &'static str,
    pub phase: &'static str,
    pub payload: Value,
}

pub use genos_worker::native::{Computation, WorkerJob, WorkerReply, WorkerRole};

pub struct ContextCommitment {
    pub source_hash: String,
    pub input_hash: String,
    pub base_hash: String,
    pub base_generation: u64,
}

