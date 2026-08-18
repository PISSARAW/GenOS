mod common;

use common::{make_snapshot, temp_store_path};
use chrono::Utc;
use genos_core::{AgentEvent, AgentEventType, CorrelationId, EventId};
use genos_store::{EventStore, LocalEventStore, LocalSnapshotStore, SnapshotStore};
use serde_json::json;
use tokio::fs;

#[tokio::test]
async fn clone_without_llm_starts_identical_but_has_distinct_identity_and_streams() {
    let events_path = temp_store_path();
    let snapshots_path = temp_store_path();
    let event_store = LocalEventStore::new(&events_path);
    let snapshot_store = LocalSnapshotStore::new(&snapshots_path);

    let mut parent = make_snapshot(0);
    parent
        .state
        .working_memory
        .items
        .push(genos_core::WorkingMemoryItem {
            key: "seed_note".to_string(),
            value: "minimal-memory".to_string(),
        });
    parent
        .state
        .semantic_memory
        .refs
        .push(genos_core::MemoryId::new());

    snapshot_store
        .save_snapshot(parent.clone())
        .await
        .expect("save parent snapshot failed");

    let clone_a1 = genos_core::fork_snapshot(&parent);
    let clone_a2 = genos_core::fork_snapshot(&parent);

    snapshot_store
        .save_snapshot(clone_a1.clone())
        .await
        .expect("save clone_a1 snapshot failed");
    snapshot_store
        .save_snapshot(clone_a2.clone())
        .await
        .expect("save clone_a2 snapshot failed");

    assert_eq!(clone_a1.genome, clone_a2.genome);
    assert_eq!(clone_a1.state.working_memory, clone_a2.state.working_memory);
    assert_eq!(
        clone_a1.state.semantic_memory,
        clone_a2.state.semantic_memory
    );
    assert_eq!(
        clone_a1.state.episodic_memory,
        clone_a2.state.episodic_memory
    );
    assert_eq!(clone_a1.state.beliefs, clone_a2.state.beliefs);
    assert_eq!(clone_a1.state.active_goals, clone_a2.state.active_goals);
    assert_eq!(clone_a1.state.execution, clone_a2.state.execution);
    assert_eq!(clone_a1.state.artifact_refs, clone_a2.state.artifact_refs);
    assert_eq!(
        clone_a1.state.event_cursor.sequence,
        clone_a2.state.event_cursor.sequence
    );
    assert_eq!(
        clone_a1.state.event_cursor.last_event_id,
        clone_a2.state.event_cursor.last_event_id
    );

    assert_ne!(clone_a1.agent_id, clone_a2.agent_id);
    assert_ne!(clone_a1.branch_id, clone_a2.branch_id);
    assert_eq!(clone_a1.branch_id, clone_a1.state.event_cursor.branch_id);
    assert_eq!(clone_a2.branch_id, clone_a2.state.event_cursor.branch_id);

    let a1_event_created = AgentEvent {
        event_id: EventId::new(),
        agent_id: clone_a1.agent_id.clone(),
        branch_id: Some(clone_a1.branch_id.clone()),
        sequence: 1,
        timestamp: Utc::now(),
        event_type: AgentEventType::ForkCreated,
        payload: json!({ "parent_snapshot_id": parent.snapshot_id.0 }),
        causation_id: None,
        correlation_id: Some(CorrelationId::new()),
    };
    let a2_event_created = AgentEvent {
        event_id: EventId::new(),
        agent_id: clone_a2.agent_id.clone(),
        branch_id: Some(clone_a2.branch_id.clone()),
        sequence: 1,
        timestamp: Utc::now(),
        event_type: AgentEventType::ForkCreated,
        payload: json!({ "parent_snapshot_id": parent.snapshot_id.0 }),
        causation_id: None,
        correlation_id: Some(CorrelationId::new()),
    };

    event_store
        .append(a1_event_created)
        .await
        .expect("append clone_a1 event failed");
    event_store
        .append(a2_event_created)
        .await
        .expect("append clone_a2 event failed");

    let stream_a1 = event_store
        .stream(Some(clone_a1.branch_id.0.clone()))
        .await
        .expect("stream clone_a1 failed");
    let stream_a2 = event_store
        .stream(Some(clone_a2.branch_id.0.clone()))
        .await
        .expect("stream clone_a2 failed");

    assert_eq!(stream_a1.len(), 1);
    assert_eq!(stream_a2.len(), 1);
    assert_eq!(stream_a1[0].agent_id, clone_a1.agent_id);
    assert_eq!(stream_a2[0].agent_id, clone_a2.agent_id);
    assert_eq!(
        stream_a1[0]
            .branch_id
            .as_ref()
            .expect("missing branch for a1"),
        &clone_a1.branch_id
    );
    assert_eq!(
        stream_a2[0]
            .branch_id
            .as_ref()
            .expect("missing branch for a2"),
        &clone_a2.branch_id
    );
    assert_ne!(stream_a1[0].event_id, stream_a2[0].event_id);

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
