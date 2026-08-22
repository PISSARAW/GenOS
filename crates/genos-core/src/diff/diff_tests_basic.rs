//! Tests for the structural diff that are not specific to memory records.
//!
//! Memory-specific tests live in `diff_tests_memory.rs`.

#![cfg(test)]

use super::*;
use crate::snapshot::tests::snapshot_with_variable;
use crate::{
    compare_snapshots, fork_snapshot, write_variable_on_branch, Belief, BeliefId, BeliefStatus,
    Capability, Goal,
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
    assert_ne!(
        a1.state.event_cursor.branch_id,
        a2.state.event_cursor.branch_id
    );
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

    let first = crate::MemoryId("memory-1".to_string());
    let second = crate::MemoryId("memory-2".to_string());
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
        diff.event_summary
            .iter()
            .map(|e| e.path.as_str())
            .collect::<Vec<_>>(),
        vec![
            "state.event_cursor.sequence",
            "state.event_cursor.last_event_id"
        ]
    );
}

/// One field changed, one entry reported â€” not a re-dump of the genome.
#[test]
fn a_single_cognition_change_is_reported_as_a_single_entry() {
    let parent = snapshot_with_variable("counter", "0");
    let a1 = fork_snapshot(&parent);
    let mut a2 = fork_snapshot(&parent);

    assert_eq!(a1.genome.cognition.get_drive("exploration").unwrap(), 0.7);
    a2.genome.cognition.set_drive("exploration", 0.8);

    let diff = diff_snapshots(&a1, &a2);

    assert_eq!(diff.len(), 1);
    assert_eq!(
        diff.genome_diff,
        vec![DiffEntry {
            path: "genome.cognition.chromosomes[0].loci[0].value".to_string(),
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

    a2.genome.cognition.set_drive("exploration", 0.8);
    a2.genome
        .cognition
        .set_drive("verification_threshold", 0.55);

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
    let mut a2 = a1.clone();
    a2.genome.cognition.set_drive("exploration", 0.8);

    assert_eq!(
        diff_snapshots(&a1, &a2).to_text(),
        "GenomeDiff\n  genome.cognition.chromosomes[0].loci[0].value\n    old: 0.7\n    new: 0.8\n"
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
