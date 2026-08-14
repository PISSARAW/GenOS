//! Tests for [`crate::snapshot::restore_snapshot`] and friends.
//!
//! The shared `parent_snapshot` and `snapshot_with_variable` helpers live in
//! [`super::tests`]; the former is private to that module so the tests here
//! build helpers from the `pub(crate)` `snapshot_with_variable` entry point.

use super::*;
use crate::AgentEventType;
use crate::WorkingMemoryItem;
use chrono::TimeZone;

fn at(year: i32, month: u32, day: u32, hour: u32, min: u32, sec: u32) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, day, hour, min, sec)
        .unwrap()
}

/// Build a snapshot with a working-memory counter and a known cursor.
fn counter_snapshot(value: &str, sequence: u64) -> AgentSnapshot {
    let mut snapshot = tests::snapshot_with_variable("counter", value);
    snapshot.state.event_cursor.sequence = sequence;
    snapshot
}

/// Index of the "counter" entry inside `snapshot_with_variable`'s output.
/// The helper pushes `counter` after the seeded `seed_note`, so it sits at
/// index 1.
const COUNTER_INDEX: usize = 1;

#[test]
fn restore_rewinds_a_counter_variable() {
    // Before any restore: counter = 10 (sequence 0).
    let saved = counter_snapshot("10", 0);

    // User goes on to write counter = 50; the snapshot now reflects that
    // (sequence 3 — three writes happened).
    let mut current = saved.clone();
    current.state.working_memory.items[COUNTER_INDEX].value = "50".to_string();
    current.state.event_cursor.sequence = 3;

    // Restore rewinds to the saved snapshot.
    let write = restore_snapshot(&current, &saved);

    // The restored snapshot carries the saved value (counter = 10) ...
    assert_eq!(
        write.snapshot.state.working_memory.items[COUNTER_INDEX].value, "10",
        "counter should be rewound to 10 after restore"
    );
    // ... but the same snapshot_id as `current`.
    assert_eq!(write.snapshot.snapshot_id, current.snapshot_id);
    // ... and the same branch_id.
    assert_eq!(write.snapshot.branch_id, current.branch_id);
    assert_eq!(write.snapshot.agent_id, current.agent_id);

    // The cursor advanced past the Restored event: 3 → 4.
    assert_eq!(write.snapshot.state.event_cursor.sequence, 4);
    assert_eq!(
        write.snapshot.state.event_cursor.last_event_id,
        Some(write.event.event_id.clone())
    );
    assert_eq!(write.event.event_type, AgentEventType::Restored);
    assert_eq!(write.event.sequence, 4);
}

#[test]
fn restore_keeps_event_history_visible() {
    // The whole point: even after a restore, the events emitted *before*
    // the restore are still on the branch stream. The event store is
    // append-only by construction (no code path deletes events), so we
    // only need to assert that the restore emits its OWN event without
    // touching the prior sequence numbers.
    let saved = counter_snapshot("10", 0);
    let mut current = saved.clone();
    current.state.working_memory.items[COUNTER_INDEX].value = "50".to_string();
    current.state.event_cursor.sequence = 5;
    current.state.event_cursor.last_event_id = Some(crate::ids::EventId::new());

    let write = restore_snapshot(&current, &saved);

    // The Restored event itself is at sequence 6 (5 + 1). A replay of the
    // branch from sequence 0 to 6 still sees events 1..=5 unchanged.
    assert_eq!(write.event.sequence, 6);
    assert_eq!(
        write
            .event
            .payload
            .get("previous_sequence")
            .and_then(|v| v.as_u64()),
        Some(5)
    );

    // The event references the source snapshot id so a replay can
    // reconstruct the edge.
    assert_eq!(
        write
            .event
            .payload
            .get("source_snapshot_id")
            .and_then(|v| v.as_str()),
        Some(saved.snapshot_id.0.as_str())
    );
}

#[test]
fn restore_records_only_fields_that_actually_diverged() {
    let mut saved = tests::parent_snapshot(0);
    saved.state.working_memory.items.push(WorkingMemoryItem {
        key: "counter".to_string(),
        value: "10".to_string(),
    });
    saved.state.execution.step = 0;

    // Drift only the counter and the cursor sequence — everything else
    // (memories, beliefs, genome, runtime_metadata) stays identical.
    let mut current = saved.clone();
    current.state.working_memory.items[1].value = "50".to_string();
    current.state.event_cursor.sequence = 7;
    current.state.event_cursor.last_event_id = Some(crate::ids::EventId::new());

    let write = restore_snapshot(&current, &saved);

    // working_memory and the two cursor fields should be in the diff;
    // everything else is unchanged.
    let mut names: Vec<&str> = write.restored_fields.iter().map(String::as_str).collect();
    names.sort();
    assert_eq!(
        names,
        vec![
            "state.event_cursor.last_event_id",
            "state.event_cursor.sequence",
            "state.working_memory",
        ]
    );
}

#[test]
fn restore_at_explicit_timestamp_uses_it_for_event_and_snapshot() {
    let saved = counter_snapshot("10", 0);
    let mut current = saved.clone();
    current.state.working_memory.items[COUNTER_INDEX].value = "50".to_string();
    current.state.event_cursor.sequence = 2;

    let ts = at(2026, 1, 2, 3, 4, 5);
    let write = restore_snapshot_at(&current, &saved, ts);

    assert_eq!(write.snapshot.created_at, ts);
    assert_eq!(write.event.timestamp, ts);
}

#[test]
fn restore_rejects_cross_branch_sources() {
    let mut saved = tests::parent_snapshot(0);
    saved.state.working_memory.items.push(WorkingMemoryItem {
        key: "counter".to_string(),
        value: "10".to_string(),
    });

    // Current snapshot is on a different branch than saved.
    let mut current = saved.clone();
    current.branch_id = crate::ids::BranchId::new();
    current.state.event_cursor.branch_id = current.branch_id.clone();
    current.state.working_memory.items[COUNTER_INDEX].value = "50".to_string();

    let result = std::panic::catch_unwind(|| restore_snapshot(&current, &saved));
    assert!(
        result.is_err(),
        "restore across branches should panic, not silently cross"
    );
}

#[test]
fn restore_with_no_drift_still_emits_an_event() {
    // target == source: no logical fields differ. The restore must still
    // stamp a Restored event so the audit trail records that the user
    // asked for a rewind, even if the rewind was a no-op.
    let saved = counter_snapshot("10", 2);
    let mut current = saved.clone();
    current.state.event_cursor.sequence = 2;

    let write = restore_snapshot(&current, &saved);

    assert!(write.restored_fields.is_empty());
    assert_eq!(write.event.event_type, AgentEventType::Restored);
    assert_eq!(write.event.sequence, 3);
}

#[test]
fn restore_is_distinguishable_from_fork_in_compare() {
    // After a restore, compare_snapshots(target_after_restore, source) reports
    // same logical state for everything except the cursor (which now points
    // at the Restored event), distinct snapshot_id when target had a
    // different id than source (true in general — restore rewinds state, not
    // identity), and the same branch_id (the whole point of restore vs
    // fork).
    let saved = counter_snapshot("10", 0);
    let mut current = counter_snapshot("50", 3);
    current.snapshot_id = crate::ids::SnapshotId::new();
    current.branch_id = saved.branch_id.clone();
    current.state.event_cursor.branch_id = saved.branch_id.clone();
    // Restore rewinds state but keeps current's identity.
    let write = restore_snapshot(&current, &saved);

    let cmp = compare_snapshots(&write.snapshot, &saved);
    // The cursor advanced past the Restored event (target sequence 3 → 4,
    // source sequence 0), so the cursor fields legitimately differ.
    assert_eq!(
        cmp.differing_fields,
        vec![
            "state.event_cursor.sequence".to_string(),
            "state.event_cursor.last_event_id".to_string(),
        ]
    );
    // Everything else matches.
    assert_eq!(
        cmp.identical_fields.len(),
        LOGICAL_STATE_FIELDS.len() - cmp.differing_fields.len()
    );
    assert!(cmp.distinct_snapshot_id);
    assert!(!cmp.distinct_branch_id);
    assert!(cmp.event_cursors_bound_to_own_branch);
}

#[test]
fn restore_preserves_event_cursor_branch_binding() {
    // Branch invariant: a snapshot's branch_id must equal
    // state.event_cursor.branch_id. The restore keeps this true because we
    // copy source.branch_id into new_state.event_cursor.branch_id when
    // building the restored snapshot.
    let saved = counter_snapshot("10", 0);
    let mut current = saved.clone();
    current.state.working_memory.items[0].value = "50".to_string();
    current.state.event_cursor.sequence = 1;

    let write = restore_snapshot(&current, &saved);

    assert_eq!(
        write.snapshot.branch_id,
        write.snapshot.state.event_cursor.branch_id
    );
}
