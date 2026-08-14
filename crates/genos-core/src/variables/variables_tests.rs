//! Tests for branch-local variable isolation.

#![cfg(test)]

use super::*;
use crate::snapshot::tests::snapshot_with_variable;
use crate::{compare_snapshots, fork_snapshot};

const INITIAL: &str = "0";

/// The case this module exists for: two branches, one variable, two values.
#[test]
fn two_branches_write_the_same_variable_differently() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);
    let mut a2 = fork_snapshot(&parent);

    a1.set_variable("counter", "10");
    a2.set_variable("counter", "20");

    assert_eq!(a1.variable("counter"), Some("10"));
    assert_eq!(a2.variable("counter"), Some("20"));
    assert_eq!(parent.variable("counter"), Some(INITIAL));

    let report = check_variable_isolation(
        "counter",
        VariableExpectation::holds(&parent, INITIAL),
        &[
            VariableExpectation::holds(&a1, "10"),
            VariableExpectation::holds(&a2, "20"),
        ],
    );

    assert!(report.isolated, "{report:?}");
    assert!(report.parent_preserved);
    assert!(report.branches_hold_expected_values);
    assert!(report.branch_values_distinct);
    assert!(report.violations.is_empty());
    assert_eq!(report.parent.actual_value.as_deref(), Some(INITIAL));
    assert_eq!(report.branches[0].actual_value.as_deref(), Some("10"));
    assert_eq!(report.branches[1].actual_value.as_deref(), Some("20"));
}

#[test]
fn diverging_writes_leave_working_memory_as_the_only_difference() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);
    let mut a2 = fork_snapshot(&parent);

    a1.set_variable("counter", "10");
    a2.set_variable("counter", "20");

    let comparison = compare_snapshots(&a1, &a2);
    assert!(!comparison.same_logical_state);
    assert_eq!(comparison.differing_fields, vec!["state.working_memory"]);
    assert!(comparison.distinct_identity);
    assert!(comparison.event_cursors_bound_to_own_branch);
}

#[test]
fn a_third_branch_still_reads_the_parent_value() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);
    let mut a2 = fork_snapshot(&parent);
    let a3 = fork_snapshot(&parent);

    a1.set_variable("counter", "10");
    a2.set_variable("counter", "20");

    assert_eq!(a3.variable("counter"), Some(INITIAL));
}

#[test]
fn writing_a_new_key_leaves_siblings_without_it() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);
    let a2 = fork_snapshot(&parent);

    assert_eq!(a1.set_variable("attempts", "3"), None);

    assert_eq!(a1.variable("attempts"), Some("3"));
    assert_eq!(a2.variable("attempts"), None);
    assert_eq!(parent.variable("attempts"), None);

    let report = check_variable_isolation(
        "attempts",
        VariableExpectation::absent(&parent),
        &[
            VariableExpectation::holds(&a1, "3"),
            VariableExpectation::absent(&a2),
        ],
    );
    assert!(report.isolated, "{report:?}");
}

#[test]
fn set_variable_returns_the_previous_value() {
    let mut snapshot = snapshot_with_variable("counter", INITIAL);

    assert_eq!(snapshot.set_variable("counter", "10"), Some(INITIAL.to_string()));
    assert_eq!(snapshot.set_variable("counter", "20"), Some("10".to_string()));
    assert_eq!(snapshot.variable("counter"), Some("20"));
    assert_eq!(
        snapshot
            .state
            .working_memory
            .items
            .iter()
            .filter(|item| item.key == "counter")
            .count(),
        1,
        "overwriting must not append a second entry for the same key"
    );
}

#[test]
fn report_flags_a_write_that_reached_the_parent() {
    let mut parent = snapshot_with_variable("counter", INITIAL);
    let a1 = fork_snapshot(&parent);

    // Stand-in for a leak: the parent gets the value the branch wrote.
    parent.set_variable("counter", "10");

    let report = check_variable_isolation(
        "counter",
        VariableExpectation::holds(&parent, INITIAL),
        &[VariableExpectation::holds(&a1, INITIAL)],
    );

    assert!(!report.isolated);
    assert!(!report.parent_preserved);
    assert!(report.branches_hold_expected_values);
    assert_eq!(report.violations.len(), 1);
    assert!(report.violations[0].contains("counter=0"));
    assert!(report.violations[0].contains("holds 10"));
}

#[test]
fn report_flags_branches_that_did_not_diverge() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);
    let mut a2 = fork_snapshot(&parent);

    a1.set_variable("counter", "10");
    a2.set_variable("counter", "10");

    let report = check_variable_isolation(
        "counter",
        VariableExpectation::holds(&parent, INITIAL),
        &[
            VariableExpectation::holds(&a1, "10"),
            VariableExpectation::holds(&a2, "20"),
        ],
    );

    assert!(!report.isolated);
    assert!(report.parent_preserved);
    assert!(!report.branches_hold_expected_values);
    assert!(!report.branch_values_distinct);
    assert_eq!(report.violations.len(), 2);
}

#[test]
fn each_write_event_stays_on_its_own_branch() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);
    let mut a2 = fork_snapshot(&parent);

    let w1 = write_variable_on_branch(&mut a1, "counter", "10");
    let w2 = write_variable_on_branch(&mut a2, "counter", "20");

    assert_eq!(w1.previous_value.as_deref(), Some(INITIAL));
    assert_eq!(w1.event.event_type, AgentEventType::MemoryUpdated);
    assert_eq!(w1.event.branch_id.as_ref(), Some(&a1.branch_id));
    assert_eq!(w1.event.agent_id, a1.agent_id);
    assert_eq!(w2.event.branch_id.as_ref(), Some(&a2.branch_id));
    assert_eq!(w2.event.agent_id, a2.agent_id);
    assert_ne!(w1.event.event_id, w2.event.event_id);
    assert_ne!(w1.event.branch_id, w2.event.branch_id);

    // Both branches inherited the same watermark, so both writes are the
    // first event of their own stream.
    assert_eq!(w1.event.sequence, 1);
    assert_eq!(w2.event.sequence, 1);

    // The cursor follows the write, and the parent is untouched by both.
    assert_eq!(a1.state.event_cursor.sequence, 1);
    assert_eq!(a1.state.event_cursor.last_event_id, Some(w1.event.event_id.clone()));
    assert_eq!(a2.state.event_cursor.last_event_id, Some(w2.event.event_id.clone()));
    assert_eq!(parent.state.event_cursor.sequence, 0);
    assert_eq!(parent.variable("counter"), Some(INITIAL));
}

#[test]
fn first_write_of_a_key_is_recorded_as_a_creation() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);

    let write = write_variable_on_branch(&mut a1, "attempts", "3");

    assert_eq!(write.previous_value, None);
    assert_eq!(write.event.event_type, AgentEventType::MemoryCreated);
    assert_eq!(write.event.payload["key"], "attempts");
    assert_eq!(write.event.payload["previous_value"], serde_json::Value::Null);
    assert_eq!(write.event.payload["value"], "3");
}

#[test]
fn writes_on_a_branch_number_sequentially_from_the_fork_watermark() {
    let parent = snapshot_with_variable("counter", INITIAL);
    let mut a1 = fork_snapshot(&parent);

    let first = write_variable_on_branch(&mut a1, "counter", "10");
    let second = write_variable_on_branch(&mut a1, "counter", "11");

    assert_eq!(first.event.sequence, 1);
    assert_eq!(second.event.sequence, 2);
    assert_eq!(second.previous_value.as_deref(), Some("10"));
    assert_eq!(a1.variable("counter"), Some("11"));
}
