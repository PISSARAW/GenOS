mod common;

use chrono::{Duration, Utc};
use common::{make_event, make_snapshot};
use genos_core::AgentEventType;
use genos_store::{
    basic_state_from_snapshot, replay_basic_state, replay_basic_state_from, AgentLifecycle,
    BranchStatus,
};
use serde_json::json;

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
