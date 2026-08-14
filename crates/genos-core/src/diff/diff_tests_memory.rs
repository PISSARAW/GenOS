//! Tests for the diff behavior specific to memory records (added / removed /
//! edited / re-recorded, with provenance). Generic diff tests live in
//! `diff_tests_basic.rs`.

#![cfg(test)]

use super::*;
use crate::snapshot::tests::snapshot_with_variable;
use crate::{
    add_memory_on_branch, add_memory_on_branch_at, fork_snapshot, MemoryKind,
};
use chrono::{TimeZone, Utc};

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
