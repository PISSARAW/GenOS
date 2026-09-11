use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentCursor {
    pub agent_id: String,
    pub role: String,
    pub line: u32,
    pub column: u32,
    pub selection_start: u32,
    pub selection_end: u32,
    pub color: String,
    pub last_active_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum CrdtOpKind {
    InsertText { index: usize, text: String },
    DeleteText { index: usize, len: usize },
    SetField { key: String, value: serde_json::Value },
    IonicFlux { ion: String, concentration: f64, gradient: f64 },
    CytoplasmicDiffusion { molecule: String, vector: Vec<f64> },
    UpdateCursor { line: u32, column: u32, selection: Option<(u32, u32)> },
    CheckInvariant { name: String, passed: bool, error: Option<String> },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CrdtOp {
    pub op_id: String,
    pub lamport: u64,
    pub timestamp_ms: u64,
    pub agent_id: String,
    pub role: String,
    pub kind: CrdtOpKind,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct InvariantStatus {
    pub name: String,
    pub passed: bool,
    pub last_checked_ms: u64,
    pub checked_by: String,
    pub failure_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct SyncytiumSnapshot {
    pub step: u64,
    pub timestamp_ms: u64,
    pub text_content: String,
    pub shared_fields: HashMap<String, serde_json::Value>,
    pub cursors: Vec<AgentCursor>,
    pub invariants: Vec<InvariantStatus>,
    pub total_ops: usize,
    pub is_time_travel: bool,
    pub rewind_target_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SyncytiumWireEvent {
    Snapshot { snapshot: SyncytiumSnapshot },
    OpApplied { op: CrdtOp, current_text: String },
    CursorMoved { cursor: AgentCursor },
    InvariantEvaluated { invariant: InvariantStatus },
    TimeTravelRewound { snapshot: SyncytiumSnapshot, target_ms: u64 },
    Error { message: String },
}
