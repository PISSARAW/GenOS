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
use serde_json::{Map, Number, Value};
use std::fmt::Write;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub before: Option<String>,
    pub after: Option<String>,
    /// Where the changed record came from, when it carries provenance: the
    /// branch that created it, when, and on what basis. Set for records that
    /// appear on one side only, such as a memory recorded on one branch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<String>,
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

impl DiffEntry {
    /// Value on the left side, or `<absent>` when the path carries none.
    pub fn before_display(&self) -> &str {
        self.before.as_deref().unwrap_or(ABSENT)
    }

    /// Value on the right side, or `<absent>` when the path carries none.
    pub fn after_display(&self) -> &str {
        self.after.as_deref().unwrap_or(ABSENT)
    }

    /// `added` when the path exists only on the right, `removed` when it exists
    /// only on the left, `changed` when both sides carry a value.
    pub fn kind(&self) -> DiffKind {
        match (&self.before, &self.after) {
            (None, Some(_)) => DiffKind::Added,
            (Some(_), None) => DiffKind::Removed,
            _ => DiffKind::Changed,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffKind {
    Added,
    Removed,
    Changed,
}

impl DiffKind {
    pub fn label(&self) -> &'static str {
        match self {
            DiffKind::Added => "added",
            DiffKind::Removed => "removed",
            DiffKind::Changed => "changed",
        }
    }
}

/// Shown for a path that exists on only one side.
pub const ABSENT: &str = "<absent>";

impl AgentDiff {
    /// Every section, in report order, with the label used in the text report.
    pub fn sections(&self) -> [(&'static str, &Vec<DiffEntry>); 7] {
        [
            ("GenomeDiff", &self.genome_diff),
            ("StateDiff", &self.state_diff),
            ("MemoryDiff", &self.memory_diff),
            ("BeliefDiff", &self.belief_diff),
            ("WorldDiff", &self.world_diff),
            ("EventSummary", &self.event_summary),
            ("EvaluationDiff", &self.evaluation_diff),
        ]
    }

    /// Render the changed paths as a report, one section header per non-empty
    /// section and one `old`/`new` pair per path:
    ///
    /// ```text
    /// GenomeDiff
    ///   genome.cognition.exploration
    ///     old: 0.7
    ///     new: 0.8
    /// ```
    ///
    /// Empty diffs render as an empty string; the caller decides what to say
    /// about them.
    pub fn to_text(&self) -> String {
        let mut out = String::new();
        for (label, entries) in self.sections() {
            if entries.is_empty() {
                continue;
            }
            let _ = writeln!(out, "{label}");
            for entry in entries {
                match entry.kind() {
                    DiffKind::Changed => {
                        let _ = writeln!(out, "  {}", entry.path);
                    }
                    kind => {
                        let _ = writeln!(out, "  {} ({})", entry.path, kind.label());
                    }
                }
                let _ = writeln!(out, "    old: {}", entry.before_display());
                let _ = writeln!(out, "    new: {}", entry.after_display());
                if let Some(provenance) = &entry.provenance {
                    let _ = writeln!(out, "    provenance: {provenance}");
                }
            }
        }
        out
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
            // Records first: a memory that appears on one side is reported as
            // one added memory, and its id in `refs` is the index catching up.
            root_summarized(
                "state.memories",
                keyed_by(json_of(&a.state.memories), "id"),
                keyed_by(json_of(&b.state.memories), "id"),
                "content",
            ),
            root(
                "state.semantic_memory.refs",
                keyed_set(json_of(&a.state.semantic_memory.refs)),
                keyed_set(json_of(&b.state.semantic_memory.refs)),
            ),
            root(
                "state.episodic_memory.refs",
                keyed_set(json_of(&a.state.episodic_memory.refs)),
                keyed_set(json_of(&b.state.episodic_memory.refs)),
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

/// One pair of values to walk, with the field that stands for a whole record
/// when that record appears on one side only.
struct Root {
    path: String,
    a: Value,
    b: Value,
    summary_field: Option<&'static str>,
}

fn root(path: &str, a: Value, b: Value) -> Root {
    Root {
        path: path.to_string(),
        a,
        b,
        summary_field: None,
    }
}

/// A root whose records are summarized by `summary_field` when they appear on
/// one side only: a memory added on one branch reports its content, not the
/// whole record.
fn root_summarized(path: &str, a: Value, b: Value, summary_field: &'static str) -> Root {
    Root {
        summary_field: Some(summary_field),
        ..root(path, a, b)
    }
}

fn diff_roots(roots: &[Root]) -> Vec<DiffEntry> {
    let mut out = Vec::new();
    for root in roots {
        diff_values(&root.path, &root.a, &root.b, root.summary_field, &mut out);
    }
    out
}

/// Walk two values in parallel, emitting one entry per differing leaf — except
/// for a record present on one side only, which is one change, not one change
/// per field it happens to carry.
fn diff_values(
    path: &str,
    a: &Value,
    b: &Value,
    summary_field: Option<&'static str>,
    out: &mut Vec<DiffEntry>,
) {
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
                    summary_field,
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
                    summary_field,
                    out,
                );
            }
        }
        _ => out.push(DiffEntry {
            path: path.to_string(),
            before: summarize(a, summary_field),
            after: summarize(b, summary_field),
            provenance: provenance_of(a).or_else(|| provenance_of(b)),
        }),
    }
}

/// Render a value for a diff entry: a record standing on its own is reduced to
/// its summary field when the root declared one, and to compact JSON otherwise.
fn summarize(value: &Value, summary_field: Option<&str>) -> Option<String> {
    match (value, summary_field) {
        (Value::Object(map), Some(field)) => match map.get(field) {
            Some(summary) => render(summary),
            None => render(value),
        },
        _ => render(value),
    }
}

/// Provenance of a record that carries it: which branch created it, when, and
/// on what basis. Records without `created_in` have none to report.
fn provenance_of(value: &Value) -> Option<String> {
    let map = value.as_object()?;
    let created_in = map.get("created_in").and_then(Value::as_str)?;

    let mut provenance = format!("created in branch {created_in}");
    if let Some(created_at) = map.get("created_at").and_then(Value::as_str) {
        let _ = write!(provenance, " at {created_at}");
    }
    if let Some(source) = map.get("source").and_then(Value::as_str) {
        let _ = write!(provenance, ", source={source}");
    }

    Some(provenance)
}

/// `None` means "no value on this side": either absent, or explicitly null.
fn render(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(render_number(number)),
        other => Some(other.to_string()),
    }
}

/// Report a number the way the field holds it.
///
/// Serialization widens `f32` to `f64`, which turns an `exploration` of `0.7`
/// into `0.699999988079071`. When the widened value round-trips through `f32`
/// exactly, the narrow form is the one the field actually carries, so that is
/// what the diff shows. Integers and genuine `f64` values are untouched.
fn render_number(number: &Number) -> String {
    match number.as_f64() {
        Some(wide)
            if number.is_f64() && wide.is_finite() && f64::from(wide as f32) == wide =>
        {
            (wide as f32).to_string()
        }
        _ => number.to_string(),
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

/// Compare reference lists as sets by keying each element on itself.
///
/// Reordering a list is then not a change, and adding one reference is one
/// entry rather than a positional cascade through everything after it.
fn keyed_set(value: Value) -> Value {
    let Value::Array(items) = value else {
        return value;
    };

    Value::Object(
        items
            .into_iter()
            .map(|item| {
                let key = match &item {
                    Value::String(text) => text.clone(),
                    other => other.to_string(),
                };
                (key, item)
            })
            .collect(),
    )
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
        add_memory_on_branch, add_memory_on_branch_at, compare_snapshots, fork_snapshot,
        write_variable_on_branch, Belief, BeliefId, BeliefStatus, Capability, Goal, MemoryId,
        MemoryKind,
    };
    use chrono::{TimeZone, Utc};

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
                provenance: None,
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
                provenance: None,
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
                provenance: None,
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

    /// One field changed, one entry reported — not a re-dump of the genome.
    #[test]
    fn a_single_cognition_change_is_reported_as_a_single_entry() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        assert_eq!(a1.genome.cognition.exploration, 0.7);
        a2.genome.cognition.exploration = 0.8;

        let diff = diff_snapshots(&a1, &a2);

        assert_eq!(diff.len(), 1);
        assert_eq!(
            diff.genome_diff,
            vec![DiffEntry {
                path: "genome.cognition.exploration".to_string(),
                before: Some("0.7".to_string()),
                after: Some("0.8".to_string()),
                provenance: None,
            }]
        );

        // The neighbouring cognition fields, and every other section, stay out
        // of the report.
        for (label, entries) in diff.sections() {
            if label != "GenomeDiff" {
                assert!(entries.is_empty(), "{label} should be empty: {entries:?}");
            }
        }
    }

    /// `f32` widens to `f64` on serialization; the report must not leak that.
    #[test]
    fn float_fields_are_reported_at_their_own_precision() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        a2.genome.cognition.exploration = 0.8;
        a2.genome.cognition.verification_threshold = 0.55;

        let diff = diff_snapshots(&a1, &a2);
        let rendered: Vec<(&str, &str)> = diff
            .entries()
            .map(|entry| (entry.before_display(), entry.after_display()))
            .collect();

        assert_eq!(rendered, vec![("0.7", "0.8"), ("0.8", "0.55")]);
        assert!(
            !diff.to_text().contains("0.699999"),
            "widened f32 leaked into the report:\n{}",
            diff.to_text()
        );
    }

    #[test]
    fn the_text_report_names_the_section_the_path_and_both_values() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);
        a2.genome.cognition.exploration = 0.8;

        assert_eq!(
            diff_snapshots(&a1, &a2).to_text(),
            "GenomeDiff\n  genome.cognition.exploration\n    old: 0.7\n    new: 0.8\n"
        );
    }

    #[test]
    fn the_text_report_marks_a_value_that_exists_on_one_side_only() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);
        a2.set_variable("attempts", "3");

        assert_eq!(
            diff_snapshots(&a1, &a2).to_text(),
            "MemoryDiff\n  state.working_memory.attempts (added)\n    old: <absent>\n    new: 3\n"
        );
    }

    #[test]
    fn an_empty_diff_renders_as_an_empty_report() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let a2 = fork_snapshot(&parent);

        assert_eq!(diff_snapshots(&a1, &a2).to_text(), "");
    }

    #[test]
    fn integers_are_not_reformatted_as_floats() {
        let parent = snapshot_with_variable("counter", "0");
        let a1 = fork_snapshot(&parent);
        let mut a2 = fork_snapshot(&parent);

        a2.genome.cognition.planning_depth = 7;
        a2.runtime_metadata.budget_steps_remaining = 12;

        let diff = diff_snapshots(&a1, &a2);
        assert_eq!(
            diff.genome_diff[0],
            DiffEntry {
                path: "genome.cognition.planning_depth".to_string(),
                before: Some("6".to_string()),
                after: Some("7".to_string()),
                provenance: None,
            }
        );
        assert_eq!(
            diff.state_diff[0].path,
            "runtime_metadata.budget_steps_remaining"
        );
        assert_eq!(diff.state_diff[0].after_display(), "12");
    }

    /// A memory recorded on one branch is one added memory, reported with the
    /// branch it came from — not one entry per field of the record.
    #[test]
    fn a_memory_added_on_one_branch_is_one_entry_with_provenance() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);
        let b = fork_snapshot(&parent);

        let write = add_memory_on_branch_at(
            &mut a,
            MemoryKind::Semantic,
            "The API uses PostgreSQL",
            Some("schema-probe"),
            Utc.with_ymd_and_hms(2026, 8, 14, 12, 0, 0).unwrap(),
        );

        // b -> a: the memory is on the right-hand side, so it reads as added.
        let diff = diff_snapshots(&b, &a);

        let memory_entry = diff
            .memory_diff
            .iter()
            .find(|entry| entry.path.starts_with("state.memories."))
            .expect("no entry for the added memory");

        assert_eq!(memory_entry.path, format!("state.memories.{}", write.record.id.0));
        assert_eq!(memory_entry.kind(), DiffKind::Added);
        assert_eq!(memory_entry.before, None);
        assert_eq!(memory_entry.after.as_deref(), Some("The API uses PostgreSQL"));
        assert_eq!(
            memory_entry.provenance.as_deref(),
            Some(
                format!(
                    "created in branch {} at 2026-08-14T12:00:00Z, source=schema-probe",
                    a.branch_id.0
                )
                .as_str()
            )
        );

        // One record added, so one entry for it — the id showing up in the ref
        // index is the only other memory-side change.
        assert_eq!(
            diff.memory_diff
                .iter()
                .filter(|entry| entry.path.starts_with("state.memories."))
                .count(),
            1
        );
        assert_eq!(
            diff.memory_diff
                .iter()
                .filter(|entry| entry.path.starts_with("state.semantic_memory.refs"))
                .count(),
            1
        );
    }

    #[test]
    fn the_text_report_says_a_memory_was_added_and_where_it_came_from() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);
        let b = fork_snapshot(&parent);

        let write = add_memory_on_branch_at(
            &mut a,
            MemoryKind::Semantic,
            "The API uses PostgreSQL",
            Some("schema-probe"),
            Utc.with_ymd_and_hms(2026, 8, 14, 12, 0, 0).unwrap(),
        );

        let text = diff_snapshots(&b, &a).to_text();

        assert!(text.starts_with("MemoryDiff\n"), "{text}");
        assert!(
            text.contains(&format!(
                "  state.memories.{} (added)\n    old: <absent>\n    new: The API uses PostgreSQL\n    provenance: created in branch {} at 2026-08-14T12:00:00Z, source=schema-probe\n",
                write.record.id.0, a.branch_id.0
            )),
            "{text}"
        );
    }

    /// The same change seen from the other side.
    #[test]
    fn dropping_a_memory_reads_as_removed() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);
        let b = fork_snapshot(&parent);

        add_memory_on_branch(&mut a, MemoryKind::Semantic, "The API uses PostgreSQL", None);

        let entry = diff_snapshots(&a, &b)
            .memory_diff
            .into_iter()
            .find(|entry| entry.path.starts_with("state.memories."))
            .expect("no entry for the removed memory");

        assert_eq!(entry.kind(), DiffKind::Removed);
        assert_eq!(entry.before.as_deref(), Some("The API uses PostgreSQL"));
        assert_eq!(entry.after, None);
        assert!(entry.provenance.is_some());
    }

    #[test]
    fn editing_an_existing_memory_reports_the_edited_field_only() {
        let parent = snapshot_with_variable("counter", "0");
        let mut base = fork_snapshot(&parent);
        add_memory_on_branch(&mut base, MemoryKind::Semantic, "The API uses PostgreSQL", None);

        let mut edited = base.clone();
        edited.state.memories[0].content = "The API uses SQLite".to_string();

        let diff = diff_snapshots(&base, &edited);

        assert_eq!(diff.len(), 1);
        assert_eq!(
            diff.memory_diff[0].path,
            format!("state.memories.{}.content", base.state.memories[0].id.0)
        );
        assert_eq!(diff.memory_diff[0].kind(), DiffKind::Changed);
        assert_eq!(diff.memory_diff[0].provenance, None);
    }

    #[test]
    fn a_memory_recorded_on_both_branches_is_still_two_distinct_memories() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);
        let mut b = fork_snapshot(&parent);

        // Same content, recorded independently: distinct ids, distinct
        // provenance, so the diff shows one added and one removed.
        add_memory_on_branch(&mut a, MemoryKind::Semantic, "The API uses PostgreSQL", None);
        add_memory_on_branch(&mut b, MemoryKind::Semantic, "The API uses PostgreSQL", None);

        let diff = diff_snapshots(&a, &b);
        let kinds: Vec<DiffKind> = diff
            .memory_diff
            .iter()
            .filter(|entry| entry.path.starts_with("state.memories."))
            .map(|entry| entry.kind())
            .collect();

        assert_eq!(kinds.len(), 2);
        assert!(kinds.contains(&DiffKind::Added));
        assert!(kinds.contains(&DiffKind::Removed));
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
