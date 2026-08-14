//! Tests for contradiction detection on the same branch.

#![cfg(test)]

use super::*;
use crate::snapshot::tests::snapshot_with_variable;
use crate::{fork_snapshot, upsert_belief};

// Same `(subject, predicate)` with a different `object_value` on the same
// branch is a contradiction. A confidence update on the same triple is *not*
// a contradiction — the rule stays tight.

#[test]
fn opposing_objects_on_the_same_predicate_flag_a_contradiction() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let first = upsert_belief(&mut snapshot, "api", "is_bottleneck", "true", 0.8);
    assert!(first.contradictions.is_empty());
    assert_eq!(first.status, BeliefStatus::Observation);

    let second = upsert_belief(&mut snapshot, "api", "is_bottleneck", "false", 0.7);

    // The new belief flagged the older one as its contradiction.
    assert_eq!(second.contradictions, vec![first.belief_id.clone()]);
    assert_eq!(second.status, BeliefStatus::Disputed);
    assert!(second.contradiction_event.is_some());

    // Both records now `Disputed` and pointing at each other.
    let new_belief = snapshot
        .beliefs()
        .iter()
        .find(|belief| belief.id == second.belief_id)
        .expect("new belief missing");
    let old_belief = snapshot
        .beliefs()
        .iter()
        .find(|belief| belief.id == first.belief_id)
        .expect("old belief missing");
    assert_eq!(new_belief.status, BeliefStatus::Disputed);
    assert_eq!(old_belief.status, BeliefStatus::Disputed);
    assert!(new_belief.contradicts.contains(&first.belief_id));
    assert!(old_belief.contradicts.contains(&second.belief_id));
}

#[test]
fn same_predicate_with_three_distinct_objects_pairs_each_against_the_latest() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    upsert_belief(&mut snapshot, "api", "is_bottleneck", "true", 0.8);
    let second = upsert_belief(&mut snapshot, "api", "is_bottleneck", "false", 0.7);
    let third = upsert_belief(&mut snapshot, "api", "is_bottleneck", "maybe", 0.5);

    // The third one flags every prior belief with the same `(subject, predicate)`.
    assert_eq!(third.contradictions.len(), 2);
    assert!(third.contradictions.contains(&second.belief_id));
    assert_eq!(third.status, BeliefStatus::Disputed);
}

#[test]
fn different_predicate_same_subject_does_not_contradict() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    upsert_belief(&mut snapshot, "api", "uses", "postgres", 0.9);
    let second = upsert_belief(&mut snapshot, "api", "prefers", "postgres", 0.7);

    // Same subject, same object_value, different predicate: not a disagreement.
    assert!(second.contradictions.is_empty());
    assert_eq!(second.status, BeliefStatus::Observation);
    assert!(second.contradiction_event.is_none());

    let first = &snapshot.beliefs()[0];
    assert_eq!(first.status, BeliefStatus::Observation);
    assert!(first.contradicts.is_empty());
}

#[test]
fn same_predicate_and_object_is_an_update_not_a_contradiction() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let first = upsert_belief(&mut snapshot, "api", "is_bottleneck", "true", 0.8);
    let second = upsert_belief(&mut snapshot, "api", "is_bottleneck", "true", 0.4);

    // Same triple, different confidence: this is the `Updated` path, not a
    // contradiction.
    assert_eq!(second.kind, BeliefWriteKind::Updated);
    assert!(second.contradictions.is_empty());
    assert_eq!(second.status, BeliefStatus::Observation);
    assert!(second.contradiction_event.is_none());
    assert_eq!(second.belief_id, first.belief_id);
    assert_eq!(snapshot.beliefs().len(), 1);
}

#[test]
fn contradiction_event_carries_the_opposing_id_and_kind_marker() {
    let mut snapshot = snapshot_with_variable("placeholder", "0");

    let first = upsert_belief(&mut snapshot, "api", "is_bottleneck", "true", 0.8);
    let second = upsert_belief(&mut snapshot, "api", "is_bottleneck", "false", 0.7);

    let marker = second
        .contradiction_event
        .as_ref()
        .expect("contradiction event must be present");

    assert_eq!(marker.event_type, AgentEventType::MemoryUpdated);
    assert_eq!(marker.payload["kind"], "contradiction");
    assert_eq!(marker.payload["with"][0], first.belief_id.to_string());
    assert_eq!(marker.payload["subject"], "api");
    assert_eq!(marker.payload["predicate"], "is_bottleneck");
    assert_eq!(
        marker.payload["new_belief_id"],
        second.belief_id.to_string()
    );
    assert_eq!(marker.payload["new_object_value"], "false");
    assert!(marker.causation_id.is_some());
    // The marker is on the same branch, one sequence after the believer.
    assert_eq!(marker.branch_id, second.event.branch_id);
    assert_eq!(marker.sequence, second.event.sequence + 1);
}

#[test]
fn fork_isolation_means_a_contradiction_on_a_fork_does_not_leak_to_parent() {
    let mut parent = snapshot_with_variable("placeholder", "0");
    let first = upsert_belief(&mut parent, "api", "is_bottleneck", "true", 0.8);

    let mut fork = fork_snapshot(&parent);
    let second = upsert_belief(&mut fork, "api", "is_bottleneck", "false", 0.7);

    // The fork is the disagreement site.
    assert_eq!(second.contradictions, vec![first.belief_id.clone()]);
    assert_eq!(second.status, BeliefStatus::Disputed);

    // The parent's record is untouched: same belief id, same confidence, same
    // status (`Observation`), `contradicts` still empty.
    let parent_belief = parent
        .beliefs()
        .iter()
        .find(|belief| belief.id == first.belief_id)
        .expect("parent belief must still exist");
    assert_eq!(parent_belief.status, BeliefStatus::Observation);
    assert!(parent_belief.contradicts.is_empty());
    assert_eq!(parent_belief.confidence, 0.8);

    // And the fork carries its own fork-local record by id.
    let fork_belief = fork
        .beliefs()
        .iter()
        .find(|belief| belief.id == first.belief_id)
        .expect("fork belief (inherited) must exist");
    assert_eq!(fork_belief.status, BeliefStatus::Disputed);
}
