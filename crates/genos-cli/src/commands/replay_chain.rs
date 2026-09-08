//! Deterministic hash-chain used to record and verify causal execution steps
//! inside an `AgentSnapshot`. Each recorded step commits to the previous
//! step's hash plus its own action/deltas/payload, so replay can detect any
//! divergence between the recorded trace and what actually happened.
use serde_json::Value;
use sha2::{Digest, Sha256};

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn genesis_hash(snapshot_id: &str, agent_id: &str, branch_id: &str, world_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"genesis|");
    hasher.update(snapshot_id.as_bytes());
    hasher.update(b"|");
    hasher.update(agent_id.as_bytes());
    hasher.update(b"|");
    hasher.update(branch_id.as_bytes());
    hasher.update(b"|");
    hasher.update(world_id.as_bytes());
    to_hex(&hasher.finalize())
}

pub fn step_hash(prev_hash: &str, step: u64, action: &str, delta_entropy: f64, delta_dissonance: f64, payload: &Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(b"|");
    hasher.update(step.to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(action.as_bytes());
    hasher.update(b"|");
    hasher.update(format!("{:.10}", delta_entropy).as_bytes());
    hasher.update(b"|");
    hasher.update(format!("{:.10}", delta_dissonance).as_bytes());
    hasher.update(b"|");
    hasher.update(payload.to_string().as_bytes());
    to_hex(&hasher.finalize())
}
