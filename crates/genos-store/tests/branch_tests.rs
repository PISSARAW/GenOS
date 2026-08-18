mod common;

use common::{make_snapshot, temp_store_path};
use genos_core::{DiffKind, MemoryKind, VariableExpectation};
use genos_store::{
    basic_state_from_snapshot, replay_basic_state_from, EventStore, LocalEventStore,
    LocalSnapshotStore, SnapshotStore,
};
use tokio::fs;

/// A memory recorded on one branch is held by that branch only, and the
/// provenance travels with it through the store.
#[tokio::test]
async fn a_memory_recorded_on_one_branch_survives_a_store_round_trip() {
    let events_path = temp_store_path();
    let snapshots_path = temp_store_path();
    let event_store = LocalEventStore::new(&events_path);
    let snapshot_store = LocalSnapshotStore::new(&snapshots_path);

    const FACT: &str = "The API uses PostgreSQL";

    let parent = make_snapshot(0);
    assert!(parent.state.memories.is_empty());
    snapshot_store
        .save_snapshot(parent.clone())
        .await
        .expect("save parent snapshot failed");

    let mut a = genos_core::fork_snapshot(&parent);
    let b = genos_core::fork_snapshot(&parent);

    let write = genos_core::add_memory_on_branch(
        &mut a,
        MemoryKind::Semantic,
        FACT,
        Some("schema-probe"),
    );
    event_store
        .append(write.event)
        .await
        .expect("append memory event failed");
    snapshot_store
        .save_snapshot(a.clone())
        .await
        .expect("save a snapshot failed");
    snapshot_store
        .save_snapshot(b.clone())
        .await
        .expect("save b snapshot failed");

    let stored_parent = snapshot_store
        .get_snapshot(parent.snapshot_id.0.clone())
        .await
        .expect("get parent failed")
        .expect("parent missing");
    let stored_a = snapshot_store
        .get_snapshot(a.snapshot_id.0.clone())
        .await
        .expect("get a failed")
        .expect("a missing");
    let stored_b = snapshot_store
        .get_snapshot(b.snapshot_id.0.clone())
        .await
        .expect("get b failed")
        .expect("b missing");

    let recorded = stored_a
        .memory(&write.record.id)
        .expect("memory missing from its own branch");
    assert_eq!(recorded.content, FACT);
    assert_eq!(recorded.created_in, stored_a.branch_id);
    assert_eq!(recorded.source.as_deref(), Some("schema-probe"));
    assert!(stored_a
        .state
        .semantic_memory
        .refs
        .contains(&write.record.id));

    assert!(stored_b.state.memories.is_empty());
    assert!(stored_b.state.semantic_memory.refs.is_empty());
    assert!(stored_parent.state.memories.is_empty());

    let diff = genos_core::diff_snapshots(&stored_b, &stored_a);
    let entry = diff
        .memory_diff
        .iter()
        .find(|entry| entry.path == format!("state.memories.{}", write.record.id.0))
        .expect("no entry for the added memory");
    assert_eq!(entry.kind(), DiffKind::Added);
    assert_eq!(entry.after.as_deref(), Some(FACT));
    assert!(entry
        .provenance
        .as_deref()
        .expect("no provenance")
        .contains(&stored_a.branch_id.0));

    let stream_a = event_store
        .stream(Some(stored_a.branch_id.0.clone()))
        .await
        .expect("stream a failed");
    let stream_b = event_store
        .stream(Some(stored_b.branch_id.0.clone()))
        .await
        .expect("stream b failed");
    assert_eq!(stream_a.len(), 1);
    assert!(stream_b.is_empty());
    assert_eq!(stream_a[0].event_type, genos_core::AgentEventType::MemoryCreated);
    assert_eq!(stream_a[0].payload["content"], FACT);
    assert_eq!(stream_a[0].payload["created_in"], stored_a.branch_id.0);

    if fs::try_exists(&events_path)
        .await
        .expect("try_exists events failed")
    {
        fs::remove_file(events_path)
            .await
            .expect("cleanup events failed");
    }
    if fs::try_exists(&snapshots_path)
        .await
        .expect("try_exists snapshots failed")
    {
        fs::remove_file(snapshots_path)
            .await
            .expect("cleanup snapshots failed");
    }
}

/// Two branches write the same variable differently from one snapshot, and
/// the divergence still holds after a store round-trip: nothing here relies
/// on the in-memory copies staying alive.
#[tokio::test]
async fn diverging_branch_writes_survive_a_store_round_trip() {
    let events_path = temp_store_path();
    let snapshots_path = temp_store_path();
    let event_store = LocalEventStore::new(&events_path);
    let snapshot_store = LocalSnapshotStore::new(&snapshots_path);

    const INITIAL: &str = "0";

    let mut parent = make_snapshot(0);
    parent.set_variable("counter", INITIAL);
    snapshot_store
        .save_snapshot(parent.clone())
        .await
        .expect("save parent snapshot failed");

    let mut a1 = genos_core::fork_snapshot(&parent);
    let mut a2 = genos_core::fork_snapshot(&parent);

    let w1 = genos_core::write_variable_on_branch(&mut a1, "counter", "10");
    let w2 = genos_core::write_variable_on_branch(&mut a2, "counter", "20");

    event_store
        .append(w1.event)
        .await
        .expect("append a1 write failed");
    event_store
        .append(w2.event)
        .await
        .expect("append a2 write failed");
    snapshot_store
        .save_snapshot(a1.clone())
        .await
        .expect("save a1 snapshot failed");
    snapshot_store
        .save_snapshot(a2.clone())
        .await
        .expect("save a2 snapshot failed");

    let stored_parent = snapshot_store
        .get_snapshot(parent.snapshot_id.0.clone())
        .await
        .expect("get parent snapshot failed")
        .expect("parent snapshot missing");
    let stored_a1 = snapshot_store
        .get_snapshot(a1.snapshot_id.0.clone())
        .await
        .expect("get a1 snapshot failed")
        .expect("a1 snapshot missing");
    let stored_a2 = snapshot_store
        .get_snapshot(a2.snapshot_id.0.clone())
        .await
        .expect("get a2 snapshot failed")
        .expect("a2 snapshot missing");

    let report = genos_core::check_variable_isolation(
        "counter",
        VariableExpectation::holds(&stored_parent, INITIAL),
        &[
            VariableExpectation::holds(&stored_a1, "10"),
            VariableExpectation::holds(&stored_a2, "20"),
        ],
    );
    assert!(report.isolated, "{report:?}");
    assert!(report.violations.is_empty());

    let stream_a1 = event_store
        .stream(Some(stored_a1.branch_id.0.clone()))
        .await
        .expect("stream a1 failed");
    let stream_a2 = event_store
        .stream(Some(stored_a2.branch_id.0.clone()))
        .await
        .expect("stream a2 failed");

    assert_eq!(stream_a1.len(), 1);
    assert_eq!(stream_a2.len(), 1);
    assert_eq!(stream_a1[0].payload["value"], "10");
    assert_eq!(stream_a2[0].payload["value"], "20");
    assert_eq!(stream_a1[0].payload["previous_value"], INITIAL);
    assert_eq!(stream_a1[0].agent_id, stored_a1.agent_id);
    assert_eq!(stream_a2[0].agent_id, stored_a2.agent_id);

    let replay_a1 =
        replay_basic_state_from(basic_state_from_snapshot(&stored_parent), &stream_a1);
    let replay_a2 =
        replay_basic_state_from(basic_state_from_snapshot(&stored_parent), &stream_a2);
    assert_eq!(replay_a1.branch_id.as_ref(), Some(&stored_a1.branch_id));
    assert_eq!(replay_a2.branch_id.as_ref(), Some(&stored_a2.branch_id));
    assert_eq!(replay_a1.last_sequence, 1);
    assert_eq!(replay_a2.last_sequence, 1);

    let stream_parent = event_store
        .stream(Some(stored_parent.branch_id.0.clone()))
        .await
        .expect("stream parent failed");
    assert!(stream_parent.is_empty());

    if fs::try_exists(&events_path)
        .await
        .expect("try_exists events failed")
    {
        fs::remove_file(events_path)
            .await
            .expect("cleanup events failed");
    }
    if fs::try_exists(&snapshots_path)
        .await
        .expect("try_exists snapshots failed")
    {
        fs::remove_file(snapshots_path)
            .await
            .expect("cleanup snapshots failed");
    }
}
