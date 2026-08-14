//! Structural diff between two agent snapshots.
//!
//! # Semantics
//!
//! The diff covers **logical state only**: exactly the fields listed in
//! [`LOGICAL_STATE_FIELDS`](crate::LOGICAL_STATE_FIELDS). Identity
//! (`snapshot_id`, `agent_id`, `branch_id`, the cursor's `branch_id`) and
//! `created_at` are excluded on purpose — two sibling forks differ there by
//! construction, so a diff that reported them would flag every correct fork as
//! changed.
//!
//! That gives the one invariant the rest of the system can rely on:
//!
//! ```text
//! diff_snapshots(a, b).is_empty() == compare_snapshots(a, b).same_logical_state
//! ```
//!
//! In particular, two untouched forks of the same snapshot diff to nothing.
//!
//! Collections that behave like maps — working memory, beliefs, goals,
//! objectives, capabilities, tool permissions, artifact refs — are keyed by
//! their natural identifier before comparison, so a diff points at
//! `state.working_memory.counter` rather than at a positional index that shifts
//! whenever an unrelated entry is inserted. Reference lists are compared as
//! sets: reordering them is not a change.

use crate::snapshot::AgentSnapshot;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentDiff {
    pub genome_diff: Vec<DiffEntry>,
    pub state_diff: Vec<DiffEntry>,
    pub memory_diff: Vec<DiffEntry>,
    pub belief_diff: Vec<DiffEntry>,
    pub world_diff: Vec<DiffEntry>,
    pub event_summary: Vec<DiffEntry>,
    pub evaluation_diff: Vec<DiffEntry>,
}

impl AgentDiff {
    /// Every section, in report order.
    pub fn sections(&self) -> [(&'static str, &Vec<DiffEntry>); 7] {
        [
            ("genome_diff", &self.genome_diff),
            ("state_diff", &self.state_diff),
            ("memory_diff", &self.memory_diff),
            ("belief_diff", &self.belief_diff),
            ("world_diff", &self.world_diff),
            ("event_summary", &self.event_summary),
            ("evaluation_diff", &self.evaluation_diff),
        ]
    }

    /// Every entry across all sections.
    pub fn entries(&self) -> impl Iterator<Item = &DiffEntry> {
        self.sections().into_iter().flat_map(|(_, entries)| entries)
    }

    /// Number of changed paths.
    pub fn len(&self) -> usize {
        self.entries().count()
    }

    /// True when the two snapshots carry the same logical state, whatever their
    /// identity fields say.
    pub fn is_empty(&self) -> bool {
        self.entries().next().is_none()
    }

    /// The changed paths, in report order.
    pub fn changed_paths(&self) -> Vec<String> {
        self.entries().map(|entry| entry.path.clone()).collect()
    }
}

/// Structural diff of the logical state held by two snapshots.
///
/// `a` is the "before" side and `b` the "after" side. See the module docs for
/// what counts as a difference and what deliberately does not.
pub fn diff_snapshots(a: &AgentSnapshot, b: &AgentSnapshot) -> AgentDiff {
    AgentDiff {
        genome_diff: diff_roots(&[
            root("genome", genome_value(a), genome_value(b)),
            root(
                "state.genome",
                json_of(&a.state.genome),
                json_of(&b.state.genome),
            ),
        ]),
        state_diff: diff_roots(&[
            root(
                "state.active_goals",
                keyed_by(json_of(&a.state.active_goals), "key"),
                keyed_by(json_of(&b.state.active_goals), "key"),
            ),
            root(
                "state.execution",
                json_of(&a.state.execution),
                json_of(&b.state.execution),
            ),
            root(
                "state.artifact_refs",
                keyed_by(json_of(&a.state.artifact_refs), "digest"),
                keyed_by(json_of(&b.state.artifact_refs), "digest"),
            ),
            root("tool_state", json_of(&a.tool_state), json_of(&b.tool_state)),
            root(
                "runtime_metadata",
                json_of(&a.runtime_metadata),
                json_of(&b.runtime_metadata),
            ),
        ]),
        memory_diff: diff_roots(&[
            root(
                "state.working_memory",
                keyed_values(json_of(&a.state.working_memory.items), "key", "value"),
                keyed_values(json_of(&b.state.working_memory.items), "key", "value"),
            ),
            root(
                "state.semantic_memory.refs",
                sorted(json_of(&a.state.semantic_memory.refs)),
                sorted(json_of(&b.state.semantic_memory.refs)),
            ),
            root(
                "state.episodic_memory.refs",
                sorted(json_of(&a.state.episodic_memory.refs)),
                sorted(json_of(&b.state.episodic_memory.refs)),
            ),
        ]),
        belief_diff: diff_roots(&[root(
            "state.beliefs",
            keyed_by(json_of(&a.state.beliefs), "id"),
            keyed_by(json_of(&b.state.beliefs), "id"),
        )]),
        world_diff: diff_roots(&[
            root("world_id", json_of(&a.world_id), json_of(&b.world_id)),
            root(
                "state.world_id",
                json_of(&a.state.world_id),
                json_of(&b.state.world_id),
            ),
        ]),
        event_summary: diff_roots(&[
            root(
                "state.event_cursor.sequence",
                json_of(&a.state.event_cursor.sequence),
                json_of(&b.state.event_cursor.sequence),
            ),
            root(
                "state.event_cursor.last_event_id",
                json_of(&a.state.event_cursor.last_event_id),
                json_of(&b.state.event_cursor.last_event_id),
            ),
        ]),
        // Evaluation results live outside the snapshot, so nothing to compare
        // here until an experiment attaches scores to a branch.
        evaluation_diff: Vec::new(),
    }
}

/// Genome, with its keyed collections normalized.
fn genome_value(snapshot: &AgentSnapshot) -> Value {
    let mut value = json_of(&snapshot.genome);
    normalize_at(&mut value, &["objectives"], |v| keyed_by(v, "key"));
    normalize_at(&mut value, &["policies"], |v| keyed_by(v, "key"));
    normalize_at(&mut value, &["capabilities"], |v| keyed_by(v, "name"));
    normalize_at(&mut value, &["tool_policy", "permissions"], |v| {
        keyed_by(v, "tool")
    });
    value
}

fn root(path: &str, a: Value, b: Value) -> (String, Value, Value) {
    (path.to_string(), a, b)
}

fn diff_roots(roots: &[(String, Value, Value)]) -> Vec<DiffEntry> {
    let mut out = Vec::new();
    for (path, a, b) in roots {
        diff_values(path, a, b, &mut out);
    }
    out
}

/// Walk two values in parallel, emitting one entry per differing leaf.
fn diff_values(path: &str, a: &Value, b: &Value, out: &mut Vec<DiffEntry>) {
    if a == b {
        return;
    }

    match (a, b) {
        (Value::Object(map_a), Value::Object(map_b)) => {
            // serde_json maps are ordered, so the report is deterministic.
            let mut keys: Vec<&String> = map_a.keys().chain(map_b.keys()).collect();
            keys.sort();
            keys.dedup();
            for key in keys {
                diff_values(
                    &format!("{path}.{key}"),
                    map_a.get(key).unwrap_or(&Value::Null),
                    map_b.get(key).unwrap_or(&Value::Null),
                    out,
                );
            }
        }
        (Value::Array(items_a), Value::Array(items_b)) => {
            for index in 0..items_a.len().max(items_b.len()) {
                diff_values(
                    &format!("{path}[{index}]"),
                    items_a.get(index).unwrap_or(&Value::Null),
                    items_b.get(index).unwrap_or(&Value::Null),
                    out,
                );
            }
        }
        _ => out.push(DiffEntry {
            path: path.to_string(),
            before: render(a),
            after: render(b),
        }),
    }
}

/// `None` means "no value on this side": either absent, or explicitly null.
fn render(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        other => Some(other.to_string()),
    }
}

fn json_of<T: Serialize>(value: &T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

/// Turn `[{ "<key_field>": k, ... }, ...]` into `{ k: { ... } }` so a collection
/// that behaves like a map diffs by identity instead of by position. Entries
/// without a usable key keep their index, and a duplicated key keeps the last
/// entry — the same rule the rest of the model applies to duplicates.
fn keyed_by(value: Value, key_field: &str) -> Value {
    let Value::Array(items) = value else {
        return value;
    };

    let mut map = Map::new();
    for (index, item) in items.into_iter().enumerate() {
        let key = item
            .get(key_field)
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("[{index}]"));
        map.insert(key, item);
    }
    Value::Object(map)
}

/// [`keyed_by`], keeping only `value_field` as the mapped value: working memory
/// diffs as `{ counter: "10" }` rather than as a list of key/value records.
fn keyed_values(value: Value, key_field: &str, value_field: &str) -> Value {
    let Value::Object(map) = keyed_by(value, key_field) else {
        return Value::Object(Map::new());
    };

    Value::Object(
        map.into_iter()
            .map(|(key, item)| {
                let mapped = item.get(value_field).cloned().unwrap_or(item);
                (key, mapped)
            })
            .collect(),
    )
}

/// Compare reference lists as sets: reordering them is not a change.
fn sorted(value: Value) -> Value {
    let Value::Array(mut items) = value else {
        return value;
    };
    items.sort_by_key(|item| item.to_string());
    Value::Array(items)
}

/// Replace the value at `path` inside `value` by `f(value_at_path)`.
fn normalize_at(value: &mut Value, path: &[&str], f: impl FnOnce(Value) -> Value) {
    let Some((last, parents)) = path.split_last() else {
        return;
    };

    let mut cursor = value;
    for key in parents {
        match cursor.get_mut(*key) {
            Some(next) => cursor = next,
            None => return,
        }
    }

    if let Some(target) = cursor.get_mut(*last) {
        *target = f(target.take());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::tests::snapshot_with_variable;
    use crate::{
        compare_snapshots, fork_snapshot, write_variable_on_branch, Belief, BeliefId, BeliefStatus,
        Capability, Goal, MemoryId,
    };
    use chrono::Utc;

    /// The case this diff exists to pin down: two untouched forks of one
    /// snapshot are semantically identical, however much their ids differ.
    #[test]
    fn untouched_sibling_forks_diff_to_nothing() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let a2 = fork_snapshot(&parent);

        let diff = diff_snapshots(&a1, &a2);

        assert!(diff.is_empty(), "{diff:?}");
        assert_eq!(diff.len(), 0);
        assert!(diff.changed_paths().is_empty());
        for (name, entries) in diff.sections() {
            assert!(entries.is_empty(), "{name} should be empty: {entries:?}");
        }

        // The forks really are distinct agents on distinct branches: the diff is
        // empty because identity is not state, not because we compared one
        // snapshot with itself.
        assert_ne!(a1.snapshot_id, a2.snapshot_id);
        assert_ne!(a1.agent_id, a2.agent_id);
        assert_ne!(a1.branch_id, a2.branch_id);
        assert_ne!(a1.state.event_cursor.branch_id, a2.state.event_cursor.branch_id);
    }

    #[test]
    fn a_fork_diffs_to_nothing_against_its_parent() {
        let parent = snapshot_with_variable("counter", "0");
        let fork = fork_snapshot(&parent);

        assert!(diff_snapshots(&parent, &fork).is_empty());
        assert!(diff_snapshots(&parent, &parent).is_empty());
    }

    type Mutation = fn(&mut AgentSnapshot);

    /// The definition the rest of the system relies on.
    #[test]
    fn emptiness_matches_compare_snapshots() {
        let parent = snapshot_with_variable("counter", "0");

        let mutations: Vec<(&str, Mutation)> = vec![
            ("untouched", |_| {}),
            ("working_memory", |s| {
                s.set_variable("counter", "10");
            }),
            ("beliefs", |s| {
                s.state.beliefs.push(Belief {
                    id: BeliefId("belief-1".to_string()),
                    subject: "tests".to_string(),
                    predicate: "are".to_string(),
                    object_value: "green".to_string(),
                    confidence: 0.9,
                    status: BeliefStatus::Observation,
                    evidence: vec![],
                    contradicts: vec![],
                    created_in: s.branch_id.clone(),
                    created_at: Utc::now(),
                })
            }),
            ("goals", |s| {
                s.state.active_goals.push(Goal {
                    key: "ship".to_string(),
                    description: "Ship the diff".to_string(),
                })
            }),
            ("genome", |s| {
                s.genome.capabilities.push(Capability {
                    name: "counterfactual_forking".to_string(),
                    enabled: true,
                })
            }),
            ("world", |s| s.world_id = crate::WorldId::new()),
            ("execution", |s| s.state.execution.step += 1),
            ("runtime", |s| {
                s.runtime_metadata.budget_steps_remaining += 1
            }),
            ("cursor", |s| {
                write_variable_on_branch(s, "counter", "10");
            }),
        ];

        for (name, mutate) in mutations {
            let a1 = fork_snapshot(&parent);
            let mut a2 = fork_snapshot(&parent);
            mutate(&mut a2);

            let diff = diff_snapshots(&a1, &a2);
            let comparison = compare_snapshots(&a1, &a2);
            assert_eq!(
                diff.is_empty(),
                comparison.same_logical_state,
                "'{name}' disagrees: diff={diff:?}, comparison={comparison:?}"
            );
        }
    }

    #[test]
    fn a_diverging_variable_is_reported_by_key() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        a1.set_variable("counter", "10");
        a2.set_variable("counter", "20");

        let diff = diff_snapshots(&a1, &a2);

        assert_eq!(diff.changed_paths(), vec!["state.working_memory.counter"]);
        assert_eq!(
            diff.memory_diff[0],
            DiffEntry {
                path: "state.working_memory.counter".to_string(),
                before: Some("10".to_string()),
                after: Some("20".to_string()),
            }
        );
    }

    #[test]
    fn an_added_key_has_no_before_and_a_removed_key_has_no_after() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);
        a2.set_variable("attempts", "3");

        let added = diff_snapshots(&a1, &a2);
        assert_eq!(
            added.memory_diff,
            vec![DiffEntry {
                path: "state.working_memory.attempts".to_string(),
                before: None,
                after: Some("3".to_string()),
            }]
        );

        // Reversing the sides swaps before and after, and nothing else.
        let removed = diff_snapshots(&a2, &a1);
        assert_eq!(
            removed.memory_diff,
            vec![DiffEntry {
                path: "state.working_memory.attempts".to_string(),
                before: Some("3".to_string()),
                after: None,
            }]
        );
    }

    #[test]
    fn reordering_memory_refs_is_not_a_change() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        let first = MemoryId("memory-1".to_string());
        let second = MemoryId("memory-2".to_string());
        a1.state.semantic_memory.refs = vec![first.clone(), second.clone()];
        a2.state.semantic_memory.refs = vec![second, first];

        assert!(diff_snapshots(&a1, &a2).is_empty());
    }

    #[test]
    fn inserting_a_memory_key_does_not_shift_the_other_entries() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        // Inserted in front of everything, so a positional diff would report
        // every entry as changed.
        a2.state.working_memory.items.insert(
            0,
            crate::WorkingMemoryItem {
                key: "attempts".to_string(),
                value: "3".to_string(),
            },
        );

        assert_eq!(
            diff_snapshots(&a1, &a2).changed_paths(),
            vec!["state.working_memory.attempts"]
        );
    }

    #[test]
    fn changes_land_in_the_section_that_owns_them() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);

        let mut genome_changed = fork_snapshot(&parent);
        genome_changed.genome.identity.role = "reviewer".to_string();
        let diff = diff_snapshots(&a1, &genome_changed);
        assert_eq!(diff.genome_diff.len(), 1);
        assert_eq!(diff.genome_diff[0].path, "genome.identity.role");
        assert_eq!(diff.len(), 1);

        let mut world_changed = fork_snapshot(&parent);
        world_changed.world_id = crate::WorldId::new();
        let diff = diff_snapshots(&a1, &world_changed);
        assert_eq!(diff.world_diff.len(), 1);
        assert_eq!(diff.world_diff[0].path, "world_id");

        let mut goal_changed = fork_snapshot(&parent);
        goal_changed.state.active_goals[0].description = "Rewritten".to_string();
        let diff = diff_snapshots(&a1, &goal_changed);
        assert_eq!(diff.state_diff.len(), 1);
        assert_eq!(
            diff.state_diff[0].path,
            "state.active_goals.bootstrap.description"
        );

        let mut wrote = fork_snapshot(&parent);
        write_variable_on_branch(&mut wrote, "counter", "10");
        let diff = diff_snapshots(&a1, &wrote);
        assert_eq!(
            diff.event_summary.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
            vec![
                "state.event_cursor.sequence",
                "state.event_cursor.last_event_id"
            ]
        );
    }

    #[test]
    fn the_report_is_stable_across_runs() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        a1.set_variable("counter", "10");
        a1.set_variable("attempts", "1");
        a2.set_variable("counter", "20");
        a2.set_variable("attempts", "2");
        a2.genome.identity.name = "renamed".to_string();

        let first = diff_snapshots(&a1, &a2);
        let second = diff_snapshots(&a1, &a2);
        assert_eq!(first, second);
        assert_eq!(
            first.changed_paths(),
            vec![
                "genome.identity.name",
                "state.working_memory.attempts",
                "state.working_memory.counter",
            ]
        );
    }
}
