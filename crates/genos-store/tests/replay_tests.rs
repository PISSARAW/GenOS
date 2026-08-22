mod common;

use chrono::{Duration, Utc};
use common::{make_event, make_snapshot, temp_store_path};
use genos_core::snapshot::{CasHash, SnapshotComponentManifest as LegacySnapshotManifest};
use genos_core::AgentEventType;
use genos_store::{
    basic_state_from_snapshot, replay_basic_state, replay_basic_state_from, AgentLifecycle,
    BranchStatus, LocalSnapshotStore, SnapshotStore,
};
use serde_json::json;
use tokio::fs;

#[test]
fn replay_basic_state_accumulates_counters() {
    let events = vec![
        make_event(AgentEventType::AgentCreated, 1, "branch-a"),
        make_event(AgentEventType::AgentStarted, 2, "branch-a"),
        make_event(AgentEventType::AgentStep, 3, "branch-a"),
        make_event(AgentEventType::ModelResponded, 4, "branch-a"),
        make_event(AgentEventType::ToolCompleted, 5, "branch-a"),
        make_event(AgentEventType::ToolFailed, 6, "branch-a"),
        make_event(AgentEventType::SnapshotCreated, 7, "branch-a"),
        make_event(AgentEventType::AgentStopped, 8, "branch-a"),
    ];

    let replay = replay_basic_state(&events);
    assert_eq!(replay.lifecycle, AgentLifecycle::Stopped);
    assert_eq!(replay.steps, 2);
    assert_eq!(replay.model_calls, 1);
    assert_eq!(replay.tool_calls, 2);
    assert_eq!(replay.tool_failures, 1);
    assert_eq!(replay.snapshots_created, 1);
    assert_eq!(replay.last_sequence, 8);
    assert!(replay.last_event_id.is_some());
}

#[test]
fn replay_rebuilds_materialized_state_without_reexecution() {
    let mut events = Vec::new();
    for (sequence, (event_type, value)) in [
        (AgentEventType::MemoryCreated, "0"),
        (AgentEventType::MemoryUpdated, "1"),
        (AgentEventType::MemoryUpdated, "2"),
        (AgentEventType::MemoryUpdated, "7"),
    ]
    .into_iter()
    .enumerate()
    {
        let mut event = make_event(event_type, sequence as u64 + 1, "branch-a");
        event.payload = json!({
            "key": "counter",
            "value": value,
        });
        events.push(event);
    }

    let replay = replay_basic_state(&events);
    assert_eq!(
        replay.variables.get("counter").map(String::as_str),
        Some("7")
    );
    assert_eq!(replay.last_sequence, 4);
}

#[test]
fn replay_marks_crashed_branch_as_interrupted() {
    let events = [
        AgentEventType::ForkCreated,
        AgentEventType::WorldCreated,
        AgentEventType::AgentStarted,
        AgentEventType::ToolRequested,
    ]
    .into_iter()
    .enumerate()
    .map(|(index, event_type)| make_event(event_type, index as u64 + 1, "branch-a"))
    .collect::<Vec<_>>();

    let replay = replay_basic_state(&events);
    assert_eq!(replay.branch_status, BranchStatus::Interrupted);
    assert_eq!(replay.last_sequence, 4);
}

#[test]
fn branch_stops_cleanly_when_its_step_budget_is_exhausted() {
    fn model_steps(branch: &str, count: u64, max_steps: u64) -> Vec<genos_core::AgentEvent> {
        (1..=count)
            .map(|sequence| {
                let mut event = make_event(AgentEventType::ModelResponded, sequence, branch);
                event.payload = json!({ "max_steps": max_steps });
                event
            })
            .collect()
    }

    let branch_a = replay_basic_state(&model_steps("branch-a", 5, 5));
    let branch_b = replay_basic_state(&model_steps("branch-b", 5, 10));

    assert_eq!(branch_a.steps, 5);
    assert_eq!(branch_a.branch_status, BranchStatus::BudgetExhausted);
    assert_eq!(branch_a.lifecycle, AgentLifecycle::Stopped);
    assert_eq!(branch_b.branch_status, BranchStatus::Active);
}

#[test]
fn branch_stops_cleanly_when_its_duration_budget_expires() {
    let started_at = Utc::now();
    let mut start = make_event(AgentEventType::AgentStarted, 1, "branch-a");
    start.timestamp = started_at;
    start.payload = json!({ "max_duration_seconds": 10 });

    let mut after_timeout = make_event(AgentEventType::ModelResponded, 2, "branch-a");
    after_timeout.timestamp = started_at + Duration::seconds(10);
    after_timeout.payload = json!({ "max_duration_seconds": 10 });

    let replay = replay_basic_state(&[start, after_timeout]);
    assert_eq!(replay.branch_status, BranchStatus::TimedOut);
    assert_eq!(replay.lifecycle, AgentLifecycle::Stopped);
}

#[test]
fn replay_basic_state_from_snapshot_cursor() {
    let snapshot = make_snapshot(5);
    let base = basic_state_from_snapshot(&snapshot);
    assert_eq!(base.last_sequence, 5);
    assert_eq!(base.steps, 5);

    let events = vec![
        make_event(AgentEventType::ModelResponded, 6, &snapshot.branch_id.0),
        make_event(AgentEventType::ToolFailed, 7, &snapshot.branch_id.0),
    ];

    let replay = replay_basic_state_from(base, &events);
    assert_eq!(replay.last_sequence, 7);
    assert_eq!(replay.steps, 6);
    assert_eq!(replay.tool_calls, 1);
    assert_eq!(replay.tool_failures, 1);
}

#[tokio::test]
async fn replay_resolves_latest_full_snapshot_from_mixed_legacy_journal() {
    let path = temp_store_path();
    let mut latest = make_snapshot(5);
    let mut earlier = latest.clone();
    earlier.state.event_cursor.sequence = 3;
    earlier.state.execution.step = 3;

    let legacy = LegacySnapshotManifest {
        snapshot_id: latest.snapshot_id.clone(),
        agent_id: latest.agent_id.clone(),
        branch_id: latest.branch_id.clone(),
        genome_hash: CasHash("dummy_hash".to_string()),
        state_hash: CasHash("dummy_hash".to_string()),
        ssm_state_hash: None,
    };
    let mut lines = Vec::new();
    for _ in 0..12 {
        lines.push(serde_json::to_string(&legacy).expect("serialize legacy manifest"));
    }
    lines.push(serde_json::to_string(&earlier).expect("serialize earlier snapshot"));
    latest.runtime_metadata.budget_steps_remaining = 4;
    lines.push(serde_json::to_string(&latest).expect("serialize latest snapshot"));
    fs::write(&path, format!("{}\n", lines.join("\n")))
        .await
        .expect("write mixed journal");

    let store = LocalSnapshotStore::new(&path);
    let loaded = store
        .load_snapshot(&latest.snapshot_id)
        .await
        .expect("resolve snapshot from mixed journal")
        .expect("full snapshot missing");
    assert_eq!(loaded.state.event_cursor.sequence, 5);
    assert_eq!(loaded.runtime_metadata.budget_steps_remaining, 4);

    let events = vec![
        make_event(AgentEventType::ModelResponded, 6, &loaded.branch_id.0),
        make_event(AgentEventType::ToolFailed, 7, &loaded.branch_id.0),
    ];
    let replay = replay_basic_state_from(basic_state_from_snapshot(&loaded), &events);
    assert_eq!(replay.last_sequence, 7);
    assert_eq!(replay.steps, 6);
    assert_eq!(replay.tool_failures, 1);

    fs::remove_file(path).await.expect("mixed journal cleanup");
}

#[tokio::test]
async fn mixed_journal_still_rejects_an_invalid_full_snapshot() {
    let path = temp_store_path();
    let snapshot = make_snapshot(1);
    let mut invalid = serde_json::to_value(&snapshot).expect("serialize snapshot");
    invalid
        .as_object_mut()
        .expect("snapshot must be an object")
        .remove("genome");
    fs::write(&path, format!("{invalid}\n"))
        .await
        .expect("write invalid snapshot");

    let error = LocalSnapshotStore::new(&path)
        .load_snapshot(&snapshot.snapshot_id)
        .await
        .expect_err("invalid full snapshot must fail");
    assert!(error.to_string().contains("missing field `genome`"));

    fs::remove_file(path)
        .await
        .expect("invalid journal cleanup");
}

#[tokio::test]
async fn legacy_manifest_with_an_extra_field_is_rejected() {
    let path = temp_store_path();
    let snapshot = make_snapshot(1);
    let mut legacy = serde_json::to_value(LegacySnapshotManifest {
        snapshot_id: snapshot.snapshot_id.clone(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: snapshot.branch_id.clone(),
        genome_hash: CasHash("dummy_hash".to_string()),
        state_hash: CasHash("dummy_hash".to_string()),
        ssm_state_hash: None,
    })
    .expect("serialize legacy manifest");
    legacy
        .as_object_mut()
        .expect("manifest must be an object")
        .insert("unexpected".to_string(), json!(true));
    fs::write(&path, format!("{legacy}\n"))
        .await
        .expect("write adversarial manifest");

    let error = LocalSnapshotStore::new(&path)
        .load_snapshot(&snapshot.snapshot_id)
        .await
        .expect_err("extra legacy field must fail");
    assert!(error.to_string().starts_with("invalid snapshot at line 1:"));

    fs::remove_file(path)
        .await
        .expect("adversarial journal cleanup");
}

#[tokio::test]
async fn legacy_manifest_without_ssm_state_hash_is_rejected() {
    let path = temp_store_path();
    let snapshot = make_snapshot(1);
    let mut legacy = serde_json::to_value(LegacySnapshotManifest {
        snapshot_id: snapshot.snapshot_id.clone(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: snapshot.branch_id.clone(),
        genome_hash: CasHash("dummy_hash".to_string()),
        state_hash: CasHash("dummy_hash".to_string()),
        ssm_state_hash: None,
    })
    .expect("serialize legacy manifest");
    legacy
        .as_object_mut()
        .expect("manifest must be an object")
        .remove("ssm_state_hash");
    fs::write(&path, format!("{legacy}\n"))
        .await
        .expect("write incomplete manifest");

    let error = LocalSnapshotStore::new(&path)
        .load_snapshot(&snapshot.snapshot_id)
        .await
        .expect_err("incomplete legacy manifest must fail");
    assert!(error.to_string().starts_with("invalid snapshot at line 1:"));

    fs::remove_file(path)
        .await
        .expect("incomplete journal cleanup");
}

#[test]
fn replay_fingerprint_is_stable_and_covers_each_event_and_final_state() {
    let events = vec![
        make_event(AgentEventType::AgentCreated, 1, "branch-a"),
        make_event(AgentEventType::AgentStarted, 2, "branch-a"),
        make_event(AgentEventType::MemoryUpdated, 3, "branch-a"),
        make_event(AgentEventType::ModelResponded, 4, "branch-a"),
    ];

    let first = genos_store::fingerprint_replay(&events).expect("fingerprint succeeds");
    let second = genos_store::fingerprint_replay(&events).expect("fingerprint succeeds");

    assert_eq!(first, second);
    assert_eq!(first.event_count, events.len());
    assert_eq!(first.event_hashes.len(), events.len());
    assert!(!first.final_state_hash.is_empty());
}

#[test]
fn replay_fingerprint_detects_input_event_mutation() {
    let mut original = vec![make_event(AgentEventType::AgentStep, 1, "branch-a")];
    let baseline = genos_store::fingerprint_replay(&original).expect("fingerprint succeeds");
    original[0].payload = json!({"sequence": 999});
    let mutated = genos_store::fingerprint_replay(&original).expect("fingerprint succeeds");

    assert_ne!(baseline.event_hashes, mutated.event_hashes);
}
