//! Branch-local variables.
//!
//! A variable is a working-memory entry addressed by key. Because
//! [`fork_snapshot`](crate::fork_snapshot) deep-copies the parent state, a write
//! performed on one fork is invisible to its siblings and to the parent. This
//! module gives that property an explicit read/write API, an event that records
//! each write on the writer's own branch, and a report that checks the
//! isolation instead of trusting it.

use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{BranchId, EventId, SnapshotId};
use crate::snapshot::AgentSnapshot;
use crate::state::{AgentState, WorkingMemory, WorkingMemoryItem};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;

impl WorkingMemory {
    /// Value bound to `key`, or `None` when the variable was never written.
    ///
    /// Nothing forbids seeding the same key twice, so reads and writes both
    /// address the first occurrence.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.items
            .iter()
            .find(|item| item.key == key)
            .map(|item| item.value.as_str())
    }

    /// Bind `key` to `value`, returning the previous value if there was one.
    pub fn set(&mut self, key: &str, value: impl Into<String>) -> Option<String> {
        let value = value.into();
        match self.items.iter_mut().find(|item| item.key == key) {
            Some(item) => Some(std::mem::replace(&mut item.value, value)),
            None => {
                self.items.push(WorkingMemoryItem {
                    key: key.to_string(),
                    value,
                });
                None
            }
        }
    }
}

impl AgentState {
    /// Value of the branch-local variable `key`.
    pub fn variable(&self, key: &str) -> Option<&str> {
        self.working_memory.get(key)
    }

    /// Write the branch-local variable `key`, returning its previous value.
    pub fn set_variable(&mut self, key: &str, value: impl Into<String>) -> Option<String> {
        self.working_memory.set(key, value)
    }
}

impl AgentSnapshot {
    /// Value of the branch-local variable `key`.
    pub fn variable(&self, key: &str) -> Option<&str> {
        self.state.variable(key)
    }

    /// Write the branch-local variable `key`, returning its previous value.
    ///
    /// The write stays inside this snapshot: it touches neither the parent it
    /// was forked from nor any sibling fork. Use
    /// [`write_variable_on_branch`] instead when the write must also land on the
    /// branch event stream.
    pub fn set_variable(&mut self, key: &str, value: impl Into<String>) -> Option<String> {
        self.state.set_variable(key, value)
    }
}

/// A variable write applied to a branch, with the event that records it.
#[derive(Clone, Debug, PartialEq)]
pub struct VariableWrite {
    pub key: String,
    pub previous_value: Option<String>,
    pub value: String,
    /// Event carrying the write, already bound to the writer's branch and
    /// numbered at the branch's next sequence.
    pub event: AgentEvent,
}

/// Write `key = value` on `snapshot`'s own branch and advance its event cursor.
///
/// The returned event is `memory_created` for a first write and `memory_updated`
/// for an overwrite, sits on the snapshot's branch at `cursor.sequence + 1`, and
/// is the caller's to append to an event store. Callers that need to tie sibling
/// writes together can set `event.correlation_id` before appending.
pub fn write_variable_on_branch(
    snapshot: &mut AgentSnapshot,
    key: &str,
    value: &str,
) -> VariableWrite {
    write_variable_on_branch_at(snapshot, key, value, Utc::now())
}

/// [`write_variable_on_branch`] with an explicit timestamp, for deterministic tests.
pub fn write_variable_on_branch_at(
    snapshot: &mut AgentSnapshot,
    key: &str,
    value: &str,
    timestamp: DateTime<Utc>,
) -> VariableWrite {
    let previous_value = snapshot.set_variable(key, value);
    let sequence = snapshot.state.event_cursor.sequence + 1;

    let event = AgentEvent {
        event_id: EventId::new(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: Some(snapshot.branch_id.clone()),
        sequence,
        timestamp,
        event_type: match previous_value {
            Some(_) => AgentEventType::MemoryUpdated,
            None => AgentEventType::MemoryCreated,
        },
        payload: json!({
            "key": key,
            "previous_value": previous_value,
            "value": value,
        }),
        causation_id: None,
        correlation_id: None,
    };

    snapshot.state.event_cursor.sequence = sequence;
    snapshot.state.event_cursor.last_event_id = Some(event.event_id.clone());

    VariableWrite {
        key: key.to_string(),
        previous_value,
        value: value.to_string(),
        event,
    }
}

/// A snapshot paired with the value it is expected to hold for a variable.
///
/// For a fork, `expected` is the value that fork wrote. For the parent, it is
/// the value it held before the forks were mutated.
#[derive(Clone, Copy, Debug)]
pub struct VariableExpectation<'a> {
    pub snapshot: &'a AgentSnapshot,
    pub expected: Option<&'a str>,
}

impl<'a> VariableExpectation<'a> {
    /// Expect `snapshot` to hold `expected`.
    pub fn holds(snapshot: &'a AgentSnapshot, expected: &'a str) -> Self {
        Self {
            snapshot,
            expected: Some(expected),
        }
    }

    /// Expect the variable to be absent from `snapshot`.
    pub fn absent(snapshot: &'a AgentSnapshot) -> Self {
        Self {
            snapshot,
            expected: None,
        }
    }
}

/// What one snapshot actually holds for the variable under check.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VariableObservation {
    pub snapshot_id: SnapshotId,
    pub branch_id: BranchId,
    pub expected_value: Option<String>,
    pub actual_value: Option<String>,
    pub matches_expected: bool,
}

/// Outcome of checking that sibling branches wrote the same variable
/// differently without any write escaping its branch.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VariableIsolationReport {
    pub key: String,
    pub parent: VariableObservation,
    pub branches: Vec<VariableObservation>,
    /// The parent still holds its pre-fork value: no branch write reached it.
    pub parent_preserved: bool,
    /// Every branch still holds the value it wrote: no sibling overwrote it.
    pub branches_hold_expected_values: bool,
    /// No two branches ended on the same value, i.e. the writes really diverged.
    pub branch_values_distinct: bool,
    /// All three conditions above.
    pub isolated: bool,
    /// One line per broken expectation; empty when `isolated` holds.
    pub violations: Vec<String>,
}

/// Check that `branches` each kept their own write while `parent` kept its
/// pre-fork value.
///
/// This is the observable form of fork isolation for state: forking A1 and A2
/// from S0 and writing `counter = 10` on A1 and `counter = 20` on A2 must leave
/// A1 on `10`, A2 on `20` and S0 on its initial value.
pub fn check_variable_isolation(
    key: &str,
    parent: VariableExpectation<'_>,
    branches: &[VariableExpectation<'_>],
) -> VariableIsolationReport {
    let parent_observation = observe(key, parent);
    let branch_observations: Vec<VariableObservation> =
        branches.iter().map(|branch| observe(key, *branch)).collect();

    let mut violations = Vec::new();

    if !parent_observation.matches_expected {
        violations.push(format!(
            "parent snapshot {} expected {key}={} but holds {}",
            parent_observation.snapshot_id,
            render(&parent_observation.expected_value),
            render(&parent_observation.actual_value),
        ));
    }

    for observation in &branch_observations {
        if !observation.matches_expected {
            violations.push(format!(
                "branch {} expected {key}={} but holds {}",
                observation.branch_id,
                render(&observation.expected_value),
                render(&observation.actual_value),
            ));
        }
    }

    let mut seen = HashSet::new();
    let branch_values_distinct = branch_observations
        .iter()
        .all(|observation| seen.insert(observation.actual_value.clone()));
    if !branch_values_distinct {
        violations.push(format!(
            "two branches ended on the same value for {key}: {}",
            branch_observations
                .iter()
                .map(|observation| render(&observation.actual_value))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    let parent_preserved = parent_observation.matches_expected;
    let branches_hold_expected_values = branch_observations
        .iter()
        .all(|observation| observation.matches_expected);

    VariableIsolationReport {
        key: key.to_string(),
        parent: parent_observation,
        branches: branch_observations,
        parent_preserved,
        branches_hold_expected_values,
        branch_values_distinct,
        isolated: parent_preserved && branches_hold_expected_values && branch_values_distinct,
        violations,
    }
}

fn observe(key: &str, expectation: VariableExpectation<'_>) -> VariableObservation {
    let actual_value = expectation.snapshot.variable(key).map(str::to_string);
    let expected_value = expectation.expected.map(str::to_string);

    VariableObservation {
        snapshot_id: expectation.snapshot.snapshot_id.clone(),
        branch_id: expectation.snapshot.branch_id.clone(),
        matches_expected: actual_value == expected_value,
        expected_value,
        actual_value,
    }
}

fn render(value: &Option<String>) -> String {
    match value {
        Some(value) => value.clone(),
        None => "<absent>".to_string(),
    }
}

#[cfg(test)]
mod tests {
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
}
