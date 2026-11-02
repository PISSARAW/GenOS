//! Reçus non désérialisables, construits seulement depuis un processus observé.
use super::{Binding, Computation, WorkerJob, digest};
pub use super::WorkerRole;
use serde::Serialize;
use std::path::Path;

#[path = "process_launch.rs"]
mod launch;
#[path = "process_evidence.rs"]
mod evidence;
pub use evidence::ProcessEvidence;
pub use launch::{execute, executable_hash};

pub struct Launch<'a> {
    pub executable: &'a Path,
    pub job: &'a WorkerJob,
    pub maximum_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProcessReceipt {
    binding_digest: String,
    operation_id: String,
    worker_id: String,
    input_hash: String,
    decoded_input_hash: String,
    output_hash: String,
    output: Vec<u8>,
    env_hash: String,
    policy_hash: String,
    context_hash: String,
    pid: u32,
    elapsed_ms: u64,
    role: WorkerRole,
    exit_code: i32,
    succeeded: bool,
}

impl ProcessReceipt {
    pub fn assert_observation(&self, binding: &Binding) -> Result<(), String> {
        if self.binding_digest != digest(binding)? || self.env_hash != binding.env_hash
            || self.policy_hash != binding.policy_hash || self.pid == 0 || self.pid == std::process::id() {
            return Err("NATIVE_PROCESS_BINDING_MISMATCH".into());
        }
        Ok(())
    }
    pub fn assert_binding(&self, binding: &Binding) -> Result<(), String> {
        self.assert_observation(binding)?;
        if !self.succeeded || self.exit_code != 0 { return Err("NATIVE_PROCESS_RESULT_REJECTED".into()); }
        Ok(())
    }
    pub fn binding_digest(&self) -> &str { &self.binding_digest }
    pub fn operation_id(&self) -> &str { &self.operation_id }
    pub fn worker_id(&self) -> &str { &self.worker_id }
    pub fn input_hash(&self) -> &str { &self.input_hash }
    pub fn decoded_input_hash(&self) -> &str { &self.decoded_input_hash }
    pub fn output_hash(&self) -> &str { &self.output_hash }
    pub fn output(&self) -> &[u8] { &self.output }
    pub fn env_hash(&self) -> &str { &self.env_hash }
    pub fn policy_hash(&self) -> &str { &self.policy_hash }
    pub fn context_hash(&self) -> &str { &self.context_hash }
    pub fn pid(&self) -> u32 { self.pid }
    pub fn elapsed_ms(&self) -> u64 { self.elapsed_ms }
    pub fn role(&self) -> WorkerRole { self.role }
    pub fn exit_code(&self) -> i32 { self.exit_code }
    pub fn result(&self) -> Result<Computation, String> {
        serde_json::from_slice(&self.output).map_err(|e| e.to_string())
    }
}
