use super::types::{AgentCursor, CrdtOp, CrdtOpKind, InvariantStatus, SyncytiumSnapshot, SyncytiumWireEvent};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

type SharedFields = HashMap<String, serde_json::Value>;

/// Hard cap on the replay log so a long-running server cannot exhaust memory.
/// When exceeded, the oldest operations are dropped (bounded, not unbounded).
const MAX_OP_LOG: usize = 100_000;

pub struct SyncytiumEngine {
    op_log: RwLock<Vec<CrdtOp>>,
    lamport_clock: AtomicU64,
    tx: broadcast::Sender<SyncytiumWireEvent>,
}

fn role_color(role: &str) -> &'static str {
    match role {
        "shared_state_coordinator" => "#3b82f6",
        "parallel_executor" => "#10b981",
        "consistency_guardian" => "#f59e0b",
        "integration_executor" => "#8b5cf6",
        _ => "#06b6d4",
    }
}

/// Maps a UTF-16 code-unit offset (the indexing used by the JavaScript
/// backend's `String.prototype.slice`) to a byte offset on a valid UTF-8
/// boundary. Offsets that land inside a surrogate pair are rounded up to the
/// next code-point boundary, which keeps the string valid instead of panicking.
fn utf16_to_byte_index(text: &str, utf16_index: usize) -> usize {
    let mut units = 0usize;
    for (byte_index, ch) in text.char_indices() {
        if units >= utf16_index {
            return byte_index;
        }
        units += ch.len_utf16();
    }
    text.len()
}

fn apply_insert(text: &mut String, index: usize, insert_str: &str) {
    let byte_index = utf16_to_byte_index(text, index);
    text.insert_str(byte_index, insert_str);
}

fn apply_delete(text: &mut String, index: usize, len: usize) {
    let start = utf16_to_byte_index(text, index);
    let end = utf16_to_byte_index(text, index.saturating_add(len));
    if start < end {
        text.drain(start..end);
    }
}

fn apply_kind(text: &mut String, fields: &mut SharedFields, kind: &CrdtOpKind) {
    match kind {
        CrdtOpKind::InsertText { index, text: insert_str } => apply_insert(text, *index, insert_str),
        CrdtOpKind::DeleteText { index, len } => apply_delete(text, *index, *len),
        CrdtOpKind::SetField { key, value } => { fields.insert(key.clone(), value.clone()); },
        _ => {}
    }
}

fn update_cursor_entry(cursors: &mut HashMap<String, AgentCursor>, op: &CrdtOp) {
    if let CrdtOpKind::UpdateCursor { line, column, selection } = &op.kind {
        let (sel_start, sel_end) = selection.unwrap_or((*column, *column));
        cursors.insert(op.agent_id.clone(), AgentCursor {
            agent_id: op.agent_id.clone(),
            role: op.role.clone(),
            line: *line,
            column: *column,
            selection_start: sel_start,
            selection_end: sel_end,
            color: role_color(&op.role).to_string(),
            last_active_ms: op.timestamp_ms,
        });
    }
}

fn update_invariant_entry(invariants: &mut HashMap<String, InvariantStatus>, op: &CrdtOp) {
    if let CrdtOpKind::CheckInvariant { name, passed, error } = &op.kind {
        invariants.insert(name.clone(), InvariantStatus {
            name: name.clone(),
            passed: *passed,
            last_checked_ms: op.timestamp_ms,
            checked_by: format!("{}:{}", op.role, op.agent_id),
            failure_reason: error.clone(),
        });
    }
}

impl SyncytiumEngine {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(1024);
        Arc::new(Self {
            op_log: RwLock::new(Vec::new()),
            lamport_clock: AtomicU64::new(0),
            tx,
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SyncytiumWireEvent> {
        self.tx.subscribe()
    }

    pub fn next_lamport(&self) -> u64 {
        self.lamport_clock.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Lamport receive rule: ensure the local clock is at least as large as an
    /// incoming remote timestamp.
    fn observe_lamport(&self, remote: u64) {
        self.lamport_clock.fetch_max(remote, Ordering::SeqCst);
    }

    pub async fn apply_op(&self, mut op: CrdtOp) -> SyncytiumSnapshot {
        if op.lamport == 0 {
            op.lamport = self.next_lamport();
        } else {
            self.observe_lamport(op.lamport);
        }
        let mut log = self.op_log.write().await;
        log.push(op.clone());
        if log.len() > MAX_OP_LOG {
            let overflow = log.len() - MAX_OP_LOG;
            log.drain(0..overflow);
            eprintln!("[Syncytium] op log exceeded {MAX_OP_LOG} entries; dropped {overflow} oldest ops");
        }
        let snapshot = Self::build_snapshot(&log, None, None);
        drop(log);

        let event = SyncytiumWireEvent::OpApplied {
            op,
            current_text: snapshot.text_content.clone(),
        };
        let _ = self.tx.send(event);
        snapshot
    }

    pub async fn snapshot(&self) -> SyncytiumSnapshot {
        let log = self.op_log.read().await;
        Self::build_snapshot(&log, None, None)
    }

    pub async fn time_travel(&self, target_ms: u64) -> SyncytiumSnapshot {
        let log = self.op_log.read().await;
        let snapshot = Self::build_snapshot(&log, Some(target_ms), None);
        drop(log);
        self.broadcast_rewind(&snapshot, target_ms);
        snapshot
    }

    /// Rewinds to the state after exactly `step` operations. This is
    /// deterministic even when several operations share the same timestamp,
    /// unlike resolving a step back to a millisecond cutoff.
    pub async fn time_travel_to_step(&self, step: usize) -> SyncytiumSnapshot {
        let log = self.op_log.read().await;
        let snapshot = Self::build_snapshot(&log, None, Some(step));
        drop(log);
        let target_ms = snapshot.rewind_target_ms.unwrap_or(0);
        self.broadcast_rewind(&snapshot, target_ms);
        snapshot
    }

    fn broadcast_rewind(&self, snapshot: &SyncytiumSnapshot, target_ms: u64) {
        let event = SyncytiumWireEvent::TimeTravelRewound {
            snapshot: snapshot.clone(),
            target_ms,
        };
        let _ = self.tx.send(event);
    }

    pub async fn history(&self) -> Vec<CrdtOp> {
        self.op_log.read().await.clone()
    }

    fn build_snapshot(
        log: &[CrdtOp],
        target_ms: Option<u64>,
        max_ops: Option<usize>,
    ) -> SyncytiumSnapshot {
        let mut text = String::new();
        let mut fields = HashMap::new();
        let mut cursors_map = HashMap::new();
        let mut invariants_map = HashMap::new();
        let mut last_timestamp = 0u64;

        // Replay in a deterministic total order (time, Lamport, identity) so
        // every replica that holds the same ops converges to the same state
        // regardless of network arrival order.
        let mut ordered: Vec<&CrdtOp> = log.iter().collect();
        ordered.sort_by(|a, b| {
            a.timestamp_ms
                .cmp(&b.timestamp_ms)
                .then(a.lamport.cmp(&b.lamport))
                .then(a.agent_id.cmp(&b.agent_id))
                .then(a.op_id.cmp(&b.op_id))
        });

        let mut applied = 0usize;
        for op in ordered {
            if let Some(cutoff) = target_ms {
                if op.timestamp_ms > cutoff {
                    continue;
                }
            }
            if let Some(limit) = max_ops {
                if applied >= limit {
                    break;
                }
            }
            applied += 1;
            last_timestamp = last_timestamp.max(op.timestamp_ms);
            apply_kind(&mut text, &mut fields, &op.kind);
            update_cursor_entry(&mut cursors_map, op);
            update_invariant_entry(&mut invariants_map, op);
        }

        let mut cursors: Vec<AgentCursor> = cursors_map.into_values().collect();
        cursors.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));
        let mut invariants: Vec<InvariantStatus> = invariants_map.into_values().collect();
        invariants.sort_by(|a, b| a.name.cmp(&b.name));

        let is_time_travel = target_ms.is_some() || max_ops.is_some();
        let rewind_target_ms = if target_ms.is_some() {
            target_ms
        } else if max_ops.is_some() {
            Some(last_timestamp)
        } else {
            None
        };

        SyncytiumSnapshot {
            // step and total_ops both describe the replayed prefix, so a
            // rewind never reports the global apply counter.
            step: applied as u64,
            timestamp_ms: last_timestamp,
            text_content: text,
            shared_fields: fields,
            cursors,
            invariants,
            total_ops: applied,
            is_time_travel,
            rewind_target_ms,
        }
    }
}
