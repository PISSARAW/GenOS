//! Tests for branch-local tool output records.

use crate::events::AgentEventType;
use crate::fork_snapshot;
use crate::ids::ToolOutputId;
use crate::snapshot::tests::snapshot_with_variable;
use crate::tool_outputs::{record_checked_tool_call_on_branch, record_tool_call_on_branch, ToolCallRequest};
use serde_json::json;

#[test]
fn tool_output_records_carry_generating_event_id() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let write = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "db_query",
            input: json!({ "sql": "SELECT 1" }),
            output: json!({ "rows": 1 }),
            success: true,
        },
    );

    // The record's `generating_event_id` is the *completion* event, not the
    // request — that's the link the inspect walker follows from a belief's
    // evidence back through the tool output to the event.
    assert_eq!(
        write.record.generating_event_id,
        write.completed_event.event_id
    );
    assert_ne!(
        write.record.generating_event_id,
        write.requested_event.event_id
    );

    // And the completion event's `causation_id` is the request event's id.
    assert_eq!(
        write.completed_event.causation_id,
        Some(write.requested_event.event_id.clone())
    );

    // The record is findable from the snapshot by id.
    let looked_up = snapshot
        .tool_output(&write.record.id)
        .expect("just-recorded tool output should be findable");
    assert_eq!(looked_up.id, write.record.id);
    assert_eq!(looked_up.tool_name, "db_query");
    assert!(looked_up.success);
}

#[test]
fn tool_output_record_is_branch_local() {
    let mut parent = snapshot_with_variable("counter", "0");
    let write = record_tool_call_on_branch(
        &mut parent,
        ToolCallRequest {
            tool_name: "db_query",
            input: json!({}),
            output: json!({}),
            success: true,
        },
    );

    let mut a = fork_snapshot(&parent);
    let b = fork_snapshot(&parent);

    // Both forks inherited the parent's tool output (state.tool_outputs is
    // deep-copied by fork_snapshot). Isolation means *new* writes on a fork
    // don't leak to siblings.
    assert_eq!(a.tool_outputs().len(), 1);
    assert_eq!(b.tool_outputs().len(), 1);
    assert!(a.tool_output(&write.record.id).is_some());

    // New write on `a`: visible only on `a`.
    let a_write = record_tool_call_on_branch(
        &mut a,
        ToolCallRequest {
            tool_name: "another_tool",
            input: json!({}),
            output: json!({}),
            success: true,
        },
    );
    assert_eq!(a.tool_outputs().len(), 2);
    assert_eq!(b.tool_outputs().len(), 1);
    assert!(a.tool_output(&a_write.record.id).is_some());
    assert!(b.tool_output(&a_write.record.id).is_none());
    assert!(parent.tool_output(&a_write.record.id).is_none());
}

#[test]
fn tool_output_failed_flag_distinguishes_completed_from_failed() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let bad = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "db_query",
            input: json!({ "sql": "SELECT 1" }),
            output: json!({ "error": "timeout" }),
            success: false,
        },
    );

    assert_eq!(bad.completed_event.event_type, AgentEventType::ToolFailed);
    assert!(!bad.record.success);
    assert_eq!(bad.record.output, json!({ "error": "timeout" }));
}

#[test]
fn record_tool_call_appends_two_events_in_order() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let write = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "db_query",
            input: json!({}),
            output: json!({}),
            success: true,
        },
    );

    // First write: request at sequence 1, completion at sequence 2. Cursor
    // ends at the completion event.
    assert_eq!(write.requested_event.sequence, 1);
    assert_eq!(
        write.requested_event.event_type,
        AgentEventType::ToolRequested
    );
    assert_eq!(write.completed_event.sequence, 2);
    assert_eq!(
        write.completed_event.event_type,
        AgentEventType::ToolCompleted
    );
    assert_eq!(snapshot.state.event_cursor.sequence, 2);
    assert_eq!(
        snapshot.state.event_cursor.last_event_id,
        Some(write.completed_event.event_id.clone())
    );

    // Both events are on the snapshot's branch.
    assert_eq!(
        write.requested_event.branch_id.as_ref(),
        Some(&snapshot.branch_id)
    );
    assert_eq!(
        write.completed_event.branch_id.as_ref(),
        Some(&snapshot.branch_id)
    );
}

#[test]
fn read_file_result_is_attached_as_a_provenance_artifact() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let write = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "read_file",
            input: json!({ "path": "README.md" }),
            output: json!({ "content": "hello" }),
            success: true,
        },
    );

    assert_eq!(write.requested_event.event_type, AgentEventType::ToolRequested);
    assert_eq!(write.completed_event.event_type, AgentEventType::ToolCompleted);
    assert_eq!(snapshot.state.tool_outputs.len(), 1);
    assert_eq!(snapshot.state.artifact_refs.len(), 1);
    assert_eq!(snapshot.state.artifact_refs[0].media_type, "application/json");
    assert_eq!(
        snapshot.state.tool_outputs[0].generating_event_id,
        write.completed_event.event_id
    );
}

#[test]
fn failed_tool_call_is_recorded_without_failing_the_runtime() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let write = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "read_file",
            input: json!({ "path": "missing.txt" }),
            output: json!({ "error": "file not found" }),
            success: false,
        },
    );

    assert_eq!(write.requested_event.event_type, AgentEventType::ToolRequested);
    assert_eq!(write.completed_event.event_type, AgentEventType::ToolFailed);
    assert_eq!(write.record.success, false);
    assert_eq!(write.record.output, json!({ "error": "file not found" }));
    assert_eq!(snapshot.state.event_cursor.sequence, 2);
    assert_eq!(snapshot.state.tool_outputs.len(), 1);
}

#[test]
fn denied_network_tool_is_audited_without_execution() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let policy = crate::ToolPolicy { permissions: vec![crate::ToolPermission {
        tool: "http".to_string(),
        scope: "network".to_string(),
        enabled: false,
    }] };

    let write = record_checked_tool_call_on_branch(
        &mut snapshot,
        &policy,
        "http",
        "network",
        json!({ "url": "https://example.com" }),
    );

    assert_eq!(write.completed_event.event_type, AgentEventType::ToolFailed);
    assert_eq!(write.record.output["error"], "permission_denied");
    assert_eq!(snapshot.state.tool_outputs.len(), 1);
    assert_eq!(snapshot.state.event_cursor.sequence, 2);
}

#[test]
fn tool_output_ids_are_unique() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let a = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "x",
            input: json!({}),
            output: json!({}),
            success: true,
        },
    );
    let b = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: "y",
            input: json!({}),
            output: json!({}),
            success: true,
        },
    );
    assert_ne!(a.record.id, b.record.id);
    // Sanity: a fresh ToolOutputId is non-empty.
    let fresh = ToolOutputId::new();
    assert!(!fresh.0.is_empty());
}
