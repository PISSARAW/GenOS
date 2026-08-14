//! Branch-local tool output records.
//!
//! A tool call recorded on a branch is the bridge between an
//! [`AgentEventType::ToolRequested`] / [`AgentEventType::ToolCompleted`] (or
//! [`AgentEventType::ToolFailed`]) event pair and the agent's beliefs. The
//! record mirrors [`MemoryRecord`](crate::state::MemoryRecord) (same
//! provenance trio: id + created_in + created_at) and adds `success: bool`
//! plus `generating_event_id`, which is the link a provenance walk follows
//! when tracing a belief's evidence back through its tool output to the
//! event that produced it.
//!
//! Like memories, tool outputs are deep-copied by
//! [`fork_snapshot`](crate::snapshot::fork_snapshot), so a fork inherits the
//! parent's tool outputs but cannot see new ones recorded on a sibling.

#[cfg(test)]
mod tool_outputs_tests;

use crate::events::{AgentEvent, AgentEventType};
use crate::artifact::{ArtifactRef, DigestAlgorithm};
use crate::ids::{EventId, ToolOutputId};
use crate::snapshot::AgentSnapshot;
use crate::state::ToolOutputRecord;
use sha2::{Digest, Sha256};
use chrono::{DateTime, Utc};
use serde_json::json;

impl AgentSnapshot {
    /// The tool output record behind a `ToolOutputId` on this branch, if any.
    pub fn tool_output(&self, id: &ToolOutputId) -> Option<&ToolOutputRecord> {
        self.state
            .tool_outputs
            .iter()
            .find(|record| &record.id == id)
    }

    /// Tool output records on this branch, in insertion order.
    pub fn tool_outputs(&self) -> &[ToolOutputRecord] {
        &self.state.tool_outputs
    }
}

/// What a call to a tool recorded, with the events that book it.
#[derive(Clone, Debug, PartialEq)]
pub struct ToolOutputWrite {
    pub record: ToolOutputRecord,
    /// `ToolRequested` event, sequence N+1.
    pub requested_event: AgentEvent,
    /// `ToolCompleted` (or `ToolFailed`) event, sequence N+2. Its
    /// `event_id` is `record.generating_event_id`.
    pub completed_event: AgentEvent,
}

/// Inputs the caller hands to a tool call. Owned by the call for the duration
/// of `record_tool_call_on_branch[_at]`; stored as `String` / `serde_json::Value`
/// on the resulting record.
pub struct ToolCallRequest<'a> {
    pub tool_name: &'a str,
    pub input: serde_json::Value,
    pub output: serde_json::Value,
    pub success: bool,
}

/// Record a tool call on `snapshot`'s own branch and advance its event cursor.
///
/// Two events are emitted on the branch: a `ToolRequested` (sequence N+1),
/// then `ToolCompleted` or `ToolFailed` (sequence N+2, with
/// `causation_id = Some(<requested_event.event_id>)`). The record's
/// `generating_event_id` is the completion event's id — that's the link the
/// provenance walker follows when rendering the inspect tree.
///
/// `created_in` is the snapshot's branch, so a fork inherits a copy of the
/// record and continues to see it through `state.tool_outputs`. Callers
/// that want a different timestamp should use
/// [`record_tool_call_on_branch_at`] with an explicit `created_at`.
pub fn record_tool_call_on_branch(
    snapshot: &mut AgentSnapshot,
    req: ToolCallRequest<'_>,
) -> ToolOutputWrite {
    record_tool_call_on_branch_at(snapshot, req, Utc::now())
}

/// [`record_tool_call_on_branch`] with an explicit timestamp, for deterministic
/// tests.
pub fn record_tool_call_on_branch_at(
    snapshot: &mut AgentSnapshot,
    req: ToolCallRequest<'_>,
    created_at: DateTime<Utc>,
) -> ToolOutputWrite {
    let id = ToolOutputId::new();
    let artifact_bytes = serde_json::to_vec(&req.output).expect("tool output must be serializable");

    let requested_sequence = snapshot.state.event_cursor.sequence + 1;
    let requested_event = AgentEvent {
        event_id: EventId::new(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: Some(snapshot.branch_id.clone()),
        sequence: requested_sequence,
        timestamp: created_at,
        event_type: AgentEventType::ToolRequested,
        payload: json!({
            "tool_output_id": id,
            "tool_name": req.tool_name,
            "input": req.input,
        }),
        causation_id: None,
        correlation_id: None,
    };

    let completed_sequence = requested_sequence + 1;
    let completion_event_type = if req.success {
        AgentEventType::ToolCompleted
    } else {
        AgentEventType::ToolFailed
    };
    let completed_event = AgentEvent {
        event_id: EventId::new(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: Some(snapshot.branch_id.clone()),
        sequence: completed_sequence,
        timestamp: created_at,
        event_type: completion_event_type,
        payload: json!({
            "tool_output_id": id,
            "tool_name": req.tool_name,
            "input": req.input,
            "output": req.output,
            "success": req.success,
        }),
        causation_id: Some(requested_event.event_id.clone()),
        correlation_id: None,
    };

    let record = ToolOutputRecord {
        id: id.clone(),
        tool_name: req.tool_name.to_string(),
        input: req.input,
        output: req.output,
        success: req.success,
        branch_id: snapshot.branch_id.clone(),
        created_at,
        generating_event_id: completed_event.event_id.clone(),
    };

    snapshot.state.tool_outputs.push(record.clone());

    let digest = format!("{:x}", Sha256::digest(&artifact_bytes));
    snapshot.state.artifact_refs.push(ArtifactRef {
        algorithm: DigestAlgorithm::Sha256,
        digest,
        media_type: "application/json".to_string(),
        size: artifact_bytes.len() as u64,
    });

    // The cursor advances to the completion event — that is, the latest
    // event on the branch's stream.
    snapshot.state.event_cursor.sequence = completed_sequence;
    snapshot.state.event_cursor.last_event_id = Some(completed_event.event_id.clone());

    ToolOutputWrite {
        record,
        requested_event,
        completed_event,
    }
}
