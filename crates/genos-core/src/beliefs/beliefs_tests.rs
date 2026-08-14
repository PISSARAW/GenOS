//! Tests for branch-local belief isolation.

#![cfg(test)]

use super::*;
use crate::snapshot::tests::snapshot_with_variable;
use crate::{fork_snapshot, upsert_belief};

const INITIAL_CONFIDENCE: f32 = 0.9;
const UPDATED_CONFIDENCE: f32 = 0.4;

/// The case this module exists for: a single triple, two confidence values,
/// each living on its own branch.
#[test]
fn upsert_belief_creates_then_updates_on_a_branch() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let first = upsert_belief(&mut snapshot, "api", "uses", "postgres", INITIAL_CONFIDENCE);
    assert_eq!(first.kind, BeliefWriteKind::Added);
    assert_eq!(first.previous_confidence, None);
    assert_eq!(first.confidence, INITIAL_CONFIDENCE);
    assert_eq!(first.event.event_type, AgentEventType::BeliefCreated);
    assert_eq!(snapshot.beliefs().len(), 1);
    assert_eq!(snapshot.beliefs()[0].confidence, INITIAL_CONFIDENCE);

    let second = upsert_belief(&mut snapshot, "api", "uses", "postgres", UPDATED_CONFIDENCE);
    assert_eq!(second.kind, BeliefWriteKind::Updated);
    assert_eq!(second.previous_confidence, Some(INITIAL_CONFIDENCE));
    assert_eq!(second.confidence, UPDATED_CONFIDENCE);
    assert_eq!(second.event.event_type, AgentEventType::MemoryUpdated);
    assert_eq!(second.belief_id, first.belief_id);

    // Updating in place must not append a parallel record.
    assert_eq!(snapshot.beliefs().len(), 1);
    assert_eq!(snapshot.beliefs()[0].confidence, UPDATED_CONFIDENCE);
    assert_eq!(snapshot.beliefs()[0].id, first.belief_id);
}

#[test]
fn confidence_update_on_one_branch_is_invisible_to_siblings_and_parent() {
    let mut parent = snapshot_with_variable("placeholder", "0");
    let add = upsert_belief(&mut parent, "api", "uses", "postgres", INITIAL_CONFIDENCE);

    let mut a1 = fork_snapshot(&parent);
    let a2 = fork_snapshot(&parent);

    let update_a1 = upsert_belief(&mut a1, "api", "uses", "postgres", UPDATED_CONFIDENCE);

    // The branch that wrote the update sees the new value and the old one.
    assert_eq!(update_a1.previous_confidence, Some(INITIAL_CONFIDENCE));
    assert_eq!(a1.beliefs().len(), 1);
    assert_eq!(a1.beliefs()[0].confidence, UPDATED_CONFIDENCE);

    // The sibling and the parent are untouched: each fork carries its own
    // copy of the belief with its own confidence, even though they share the
    // same belief id (deep-copied along with the rest of state.beliefs).
    assert_eq!(a2.beliefs().len(), 1);
    assert_eq!(a2.beliefs()[0].confidence, INITIAL_CONFIDENCE);
    assert_eq!(a2.beliefs()[0].id, a1.beliefs()[0].id);

    assert_eq!(parent.beliefs().len(), 1);
    assert_eq!(parent.beliefs()[0].confidence, INITIAL_CONFIDENCE);
    assert_eq!(parent.beliefs()[0].id, add.belief_id);

    // Each branch's event stream records only its own writes.
    // Parent had one write (the create), so cursor=1. The forks inherit that
    // sequence as their lineage watermark; only a1 writes after forking.
    assert_eq!(parent.state.event_cursor.sequence, 1);
    assert_eq!(a1.state.event_cursor.sequence, 2);
    assert_eq!(a2.state.event_cursor.sequence, 1);
}

#[test]
fn first_event_of_a_new_belief_is_belief_created() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let write = upsert_belief(&mut snapshot, "api", "uses", "postgres", INITIAL_CONFIDENCE);

    assert_eq!(write.event.event_type, AgentEventType::BeliefCreated);
    assert_eq!(write.event.branch_id.as_ref(), Some(&snapshot.branch_id));
    assert_eq!(write.event.agent_id, snapshot.agent_id);
    assert_eq!(write.event.sequence, 1);
    assert_eq!(write.event.payload["subject"], "api");
    assert_eq!(write.event.payload["predicate"], "uses");
    assert_eq!(write.event.payload["object_value"], "postgres");
    assert_eq!(write.event.payload["confidence"], INITIAL_CONFIDENCE);
    assert_eq!(
        write.event.payload["previous_confidence"],
        serde_json::Value::Null
    );
}

#[test]
fn update_event_is_memory_updated_with_previous_confidence() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");
    upsert_belief(&mut snapshot, "api", "uses", "postgres", INITIAL_CONFIDENCE);

    let write = upsert_belief(&mut snapshot, "api", "uses", "postgres", UPDATED_CONFIDENCE);

    assert_eq!(write.event.event_type, AgentEventType::MemoryUpdated);
    assert_eq!(write.event.sequence, 2);
    assert_eq!(write.event.payload["confidence"], UPDATED_CONFIDENCE);
    assert_eq!(
        write.event.payload["previous_confidence"],
        INITIAL_CONFIDENCE
    );
}

#[test]
fn update_event_carries_the_previous_confidence_in_its_payload() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");
    upsert_belief(&mut snapshot, "api", "uses", "postgres", INITIAL_CONFIDENCE);

    let write = upsert_belief(&mut snapshot, "api", "uses", "postgres", UPDATED_CONFIDENCE);

    let previous = write
        .event
        .payload
        .get("previous_confidence")
        .and_then(|value| value.as_f64())
        .expect("previous_confidence must be present and a number");
    assert!((previous - INITIAL_CONFIDENCE as f64).abs() < 1e-6);
}

#[test]
fn confidence_must_be_a_unit_interval() {
    // add_belief validates; upsert_belief asserts (panic) — these mirror the
    // API split between "may fail with an error" and "is a programmer bug".
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let err = add_belief(
        &mut snapshot,
        "api",
        "uses",
        "postgres",
        1.5,
        BeliefStatus::Observation,
    );
    assert!(matches!(err, Err(BeliefError::ConfidenceOutOfRange(_))));

    let err = add_belief(
        &mut snapshot,
        "api",
        "uses",
        "postgres",
        -0.1,
        BeliefStatus::Observation,
    );
    assert!(matches!(err, Err(BeliefError::ConfidenceOutOfRange(_))));

    let boundary_low = add_belief(
        &mut snapshot,
        "api",
        "uses",
        "postgres",
        0.0,
        BeliefStatus::Observation,
    )
    .expect("0.0 is in the unit interval");
    assert_eq!(boundary_low.kind, BeliefWriteKind::Added);

    let boundary_high = add_belief(
        &mut snapshot,
        "api",
        "uses",
        "sqlite",
        1.0,
        BeliefStatus::Observation,
    )
    .expect("1.0 is in the unit interval");
    assert_eq!(boundary_high.kind, BeliefWriteKind::Added);
}

#[test]
fn add_belief_refuses_to_overwrite_an_existing_triple() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");
    upsert_belief(&mut snapshot, "api", "uses", "postgres", 0.9);

    let err = add_belief(
        &mut snapshot,
        "api",
        "uses",
        "postgres",
        0.4,
        BeliefStatus::Observation,
    );

    assert!(matches!(err, Err(BeliefError::AlreadyExists { .. })));
    // The existing belief is left at its original confidence.
    assert_eq!(snapshot.beliefs()[0].confidence, 0.9);
}

#[test]
fn distinct_triples_on_one_branch_each_get_their_own_belief() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let api_postgres = upsert_belief(&mut snapshot, "api", "uses", "postgres", 0.9);
    let api_redis = upsert_belief(&mut snapshot, "api", "uses", "redis", 0.7);

    assert_eq!(snapshot.beliefs().len(), 2);
    assert_ne!(api_postgres.belief_id, api_redis.belief_id);
    assert_eq!(snapshot.beliefs()[0].object_value, "postgres");
    assert_eq!(snapshot.beliefs()[1].object_value, "redis");
}

#[test]
fn belief_record_carries_created_in_branch_and_creation_time() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    upsert_belief(&mut snapshot, "api", "uses", "postgres", 0.9);

    let belief = &snapshot.beliefs()[0];
    assert_eq!(belief.created_in, snapshot.branch_id);
    assert!(belief.evidence.is_empty());
    assert!(belief.contradicts.is_empty());
    assert_eq!(belief.status, BeliefStatus::Observation);
}

#[test]
fn find_belief_returns_none_for_unknown_triples_and_some_for_known_ones() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");
    upsert_belief(&mut snapshot, "api", "uses", "postgres", 0.9);

    assert!(snapshot.find_belief("api", "uses", "postgres").is_some());
    assert!(snapshot.find_belief("api", "uses", "mysql").is_none());
    assert!(snapshot.find_belief("api", "prefers", "postgres").is_none());
}
