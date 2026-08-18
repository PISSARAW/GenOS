//! Structural diff between two agent snapshots.
//!
//! # Semantics
//!
//! The diff covers **logical state only**: exactly the fields listed in
//! [`LOGICAL_STATE_FIELDS`](crate::LOGICAL_STATE_FIELDS). Identity
//! (`snapshot_id`, `agent_id`, `branch_id`, the cursor's `branch_id`) and
//! `created_at` are excluded on purpose â€” two sibling forks differ there by
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
//! Collections that behave like maps â€” working memory, beliefs, goals,
//! objectives, capabilities, tool permissions, artifact refs â€” are keyed by
//! their natural identifier before comparison, so a diff points at
//! `state.working_memory.counter` rather than at a positional index that shifts
//! whenever an unrelated entry is inserted. Reference lists are compared as
//! sets: reordering them is not a change.

mod diff_helpers;

#[cfg(test)]
mod diff_tests_basic;
#[cfg(test)]
mod diff_tests_memory;

use crate::snapshot::AgentSnapshot;
use diff_helpers::{diff_roots, genome_value, json_of, keyed_by, keyed_set, keyed_values, Root};
use serde::{Deserialize, Serialize};
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

/// Build a root for a `diff_roots` call: a pair of values to walk, with no
/// summary field. The return type is `pub(super)` so it stays an internal
/// building block, but the helper keeps `diff_snapshots` readable.
fn root(path: &str, a: serde_json::Value, b: serde_json::Value) -> Root {
    Root::new(path, a, b)
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
            root(
                "state.memories",
                keyed_by(json_of(&a.state.memories), "id"),
                keyed_by(json_of(&b.state.memories), "id"),
            )
            .with_summary("content"),
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
