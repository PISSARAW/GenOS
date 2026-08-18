//! Tests for [`checkpoint_snapshot`] and [`checkpoint_snapshot_at`].
//!
//! Mirrors the structure of `snapshot_restore_tests.rs`: a small
//! per-test parent snapshot built through the public-in-crate helper
//! `parent_snapshot` from the `tests` module in `snapshot.rs`, then
//! assertions on the resulting `CheckpointWrite`.

use super::*;
use crate::events::AgentEventType;
use crate::ids::EventId;
use crate::tests::parent_snapshot;

#[test]
fn checkpoint_snapshot_mints_fresh_id_and_keeps_branch() {
    let parent = parent_snapshot(0);
    let write = checkpoint_snapshot(&parent);

    assert_ne!(
        write.snapshot.snapshot_id, parent.snapshot_id,
        "checkpoint must mint a fresh snapshot_id"
    );
    assert_eq!(
        write.snapshot.branch_id, parent.branch_id,
        "checkpoint keeps the branch"
    );
    assert_eq!(
        write.snapshot.agent_id, parent.agent_id,
        "checkpoint keeps the agent"
    );
}

#[test]
fn checkpoint_snapshot_records_parent_in_event_payload() {
    let parent = parent_snapshot(0);
    let write = checkpoint_snapshot(&parent);

    assert_eq!(write.event.event_type, AgentEventType::SnapshotCreated);
    assert_eq!(
        write.event.payload["parent_snapshot_id"],
        serde_json::Value::String(parent.snapshot_id.0.clone())
    );
    assert_eq!(
        write.event.payload["child_snapshot_id"],
        serde_json::Value::String(write.snapshot.snapshot_id.0.clone())
    );
    assert_eq!(write.parent_snapshot_id, parent.snapshot_id);
    // Cursor was at 0, so the event sequence must be 1.
    assert_eq!(write.event.sequence, 1);
}

#[test]
fn checkpoint_snapshot_advances_cursor() {
    let parent = parent_snapshot(7);
    let write = checkpoint_snapshot_at(&parent, Utc::now());

    assert_eq!(write.event.sequence, 8);
    assert_eq!(write.snapshot.state.event_cursor.sequence, 8);
    assert_eq!(
        write.snapshot.state.event_cursor.last_event_id,
        Some(write.event.event_id.clone())
    );
    assert_eq!(
        write.snapshot.state.event_cursor.branch_id,
        parent.branch_id
    );
}

#[test]
fn checkpoint_then_set_var_advances_further() {
    let parent = parent_snapshot(0);
    let first = checkpoint_snapshot(&parent);
    assert_eq!(first.event.sequence, 1);

    // Simulate a set-var on the new snapshot by reading its current
    // state, bumping the cursor, and checkpointing again. The second
    // checkpoint's parent_snapshot_id must be the *first* checkpoint's
    // id, not the original parent's â€” that's the lineage chain.
    let mut second_input = first.snapshot.clone();
    second_input.state.event_cursor.sequence = first.event.sequence;
    let second = checkpoint_snapshot(&second_input);

    assert_eq!(second.event.sequence, 2);
    assert_eq!(second.parent_snapshot_id, first.snapshot.snapshot_id);
    assert_ne!(
        second.parent_snapshot_id, parent.snapshot_id,
        "second checkpoint must anchor to the first checkpoint, not the original"
    );
    assert_eq!(second.snapshot.branch_id, parent.branch_id);
}

#[test]
fn checkpoint_at_explicit_timestamp_uses_it_for_event_and_snapshot() {
    let parent = parent_snapshot(2);
    let when = Utc::now() - chrono::Duration::seconds(42);
    let write = checkpoint_snapshot_at(&parent, when);

    assert_eq!(write.event.timestamp, when);
    assert_eq!(write.snapshot.created_at, when);
    assert_eq!(write.event.sequence, 3);
}

#[test]
fn checkpoint_event_carries_branch_id_for_branch_scoped_streams() {
    let parent = parent_snapshot(0);
    let write = checkpoint_snapshot(&parent);

    assert_eq!(write.event.branch_id, Some(parent.branch_id.clone()));
    assert_eq!(write.event.agent_id, parent.agent_id);
    // The event causation chain points at whatever the parent was last
    // looking at â€” None here because the parent started on an empty
    // stream.
    assert!(write.event.causation_id.is_none());
    assert!(write.event.correlation_id.is_none());
}

#[test]
fn checkpoint_with_existing_causation_advances_causality_chain() {
    let mut parent = parent_snapshot(0);
    let prior_event_id = EventId::new();
    parent.state.event_cursor.last_event_id = Some(prior_event_id.clone());

    let write = checkpoint_snapshot(&parent);
    assert_eq!(write.event.causation_id, Some(prior_event_id));
}
