//! Tests for the `evidence` field on `Belief` (typed links + auto-Inferred).

#![cfg(test)]

use super::evidence::EvidenceRef;
use super::*;
use crate::ids::ToolOutputId;
use crate::snapshot::tests::snapshot_with_variable;
use crate::tool_outputs::{record_tool_call_on_branch, ToolCallRequest};
use crate::{fork_snapshot, upsert_belief, upsert_belief_with_evidence};
use serde_json::json;

fn seed_tool_output(snapshot: &mut crate::snapshot::AgentSnapshot) -> ToolOutputId {
    let write = record_tool_call_on_branch(
        snapshot,
        ToolCallRequest {
            tool_name: "db_query",
            input: json!({ "sql": "SELECT 1" }),
            output: json!({ "rows": 1 }),
            success: true,
        },
    );
    write.record.id
}

#[test]
fn set_belief_with_evidence_marks_status_as_inferred() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let tool_output_id = seed_tool_output(&mut snapshot);

    let write = upsert_belief_with_evidence(
        &mut snapshot,
        "api",
        "returns_one",
        "yes",
        0.9,
        vec![EvidenceRef::ToolOutput { tool_output_id: tool_output_id.clone() }],
        None,
    )
    .expect("evidence points at a recorded tool output");

    assert_eq!(write.added_evidence.len(), 1);
    assert_eq!(write.tool_output_id, Some(tool_output_id.clone()));
    // Auto-Inferred when evidence is non-empty and no explicit status was
    // supplied.
    assert_eq!(write.status, BeliefStatus::Inferred);

    // The persisted belief carries the typed ref.
    let belief = snapshot
        .beliefs()
        .iter()
        .find(|b| b.id == write.belief_id)
        .expect("just-written belief");
    assert_eq!(belief.evidence.len(), 1);
    assert!(matches!(belief.evidence[0], EvidenceRef::ToolOutput { .. }));
    assert_eq!(
        belief.evidence[0].tool_output_id(),
        Some(&tool_output_id)
    );
    assert_eq!(belief.status, BeliefStatus::Inferred);
}

#[test]
fn set_belief_with_evidence_and_explicit_status_keeps_status() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let tool_output_id = seed_tool_output(&mut snapshot);

    let write = upsert_belief_with_evidence(
        &mut snapshot,
        "api",
        "returns_one",
        "yes",
        0.9,
        vec![EvidenceRef::ToolOutput { tool_output_id }],
        Some(BeliefStatus::Hypothesis),
    )
    .expect("ok");

    // Caller-supplied status wins over the auto-Inferred default.
    assert_eq!(write.status, BeliefStatus::Hypothesis);
}

#[test]
fn set_belief_with_unknown_evidence_fails() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let bogus = ToolOutputId::new();

    let err = upsert_belief_with_evidence(
        &mut snapshot,
        "api",
        "returns_one",
        "yes",
        0.9,
        vec![EvidenceRef::ToolOutput { tool_output_id: bogus.clone() }],
        None,
    )
    .unwrap_err();

    assert!(matches!(err, BeliefError::UnknownEvidence { .. }));
    // Side effect of the failure: no belief was added.
    assert!(snapshot.beliefs().is_empty());
}

#[test]
fn evidence_appended_dedups_existing_refs() {
    let mut snapshot = snapshot_with_variable("counter", "0");
    let tool_output_id = seed_tool_output(&mut snapshot);

    // First link.
    let first = upsert_belief_with_evidence(
        &mut snapshot,
        "api",
        "returns_one",
        "yes",
        0.9,
        vec![EvidenceRef::ToolOutput { tool_output_id: tool_output_id.clone() }],
        None,
    )
    .expect("ok");
    assert_eq!(first.added_evidence.len(), 1);

    // Re-link the same evidence with a confidence update: should NOT add a
    // duplicate. The dedup lives on the belief's `evidence` vec.
    let second = upsert_belief_with_evidence(
        &mut snapshot,
        "api",
        "returns_one",
        "yes",
        0.7,
        vec![EvidenceRef::ToolOutput { tool_output_id: tool_output_id.clone() }],
        None,
    )
    .expect("ok");

    assert_eq!(second.added_evidence.len(), 0);
    assert_eq!(second.tool_output_id, None); // not newly added
    let belief = snapshot
        .beliefs()
        .iter()
        .find(|b| b.id == first.belief_id)
        .expect("belief still there");
    assert_eq!(belief.evidence.len(), 1);
    assert_eq!(belief.confidence, 0.7); // the confidence update did land
}

#[test]
fn belief_evidence_is_defaulted_for_older_snapshots() {
    // Older JSON for a Belief had `evidence` absent (defaulted to empty) or
    // `evidence: []` — both deserialize to an empty `Vec<EvidenceRef>`.
    let json = r#"{
        "id": "01h0",
        "subject": "s",
        "predicate": "p",
        "object_value": "o",
        "confidence": 0.5,
        "status": "observation",
        "contradicts": [],
        "created_in": "01h0",
        "created_at": "2025-01-01T00:00:00Z"
    }"#;
    let belief: crate::state::Belief = serde_json::from_str(json).expect("deserialize");
    assert!(belief.evidence.is_empty());
}

#[test]
fn fork_inherits_the_tool_outputs_an_evidence_ref_points_at() {
    let mut parent = snapshot_with_variable("counter", "0");
    let tool_output_id = seed_tool_output(&mut parent);
    upsert_belief_with_evidence(
        &mut parent,
        "api",
        "returns_one",
        "yes",
        0.9,
        vec![EvidenceRef::ToolOutput { tool_output_id: tool_output_id.clone() }],
        None,
    )
    .expect("ok");

    let mut fork = fork_snapshot(&parent);
    // The fork inherited both the tool output and the belief (deep-copied
    // by fork_snapshot). The evidence ref still resolves.
    assert!(fork.tool_output(&tool_output_id).is_some());
    assert_eq!(fork.beliefs().len(), 1);
    assert!(fork.beliefs()[0].evidence.contains(
        &EvidenceRef::ToolOutput { tool_output_id: tool_output_id.clone() }
    ));

    // An update on the fork is also visible — the same evidence remains on
    // the fork-local copy of the belief.
    let write = upsert_belief(&mut fork, "api", "returns_one", "yes", 0.4);
    assert_eq!(write.belief_id, fork.beliefs()[0].id);
}

#[test]
fn note_evidence_does_not_require_existence_check() {
    // `EvidenceRef::Note` carries only text and bypasses the tool-output
    // existence pre-flight check.
    let mut snapshot = snapshot_with_variable("counter", "0");
    let write = upsert_belief_with_evidence(
        &mut snapshot,
        "api",
        "returns_one",
        "yes",
        0.9,
        vec![EvidenceRef::Note { text: "from the README".to_string() }],
        None,
    )
    .expect("note evidence needs no tool output");

    assert_eq!(write.status, BeliefStatus::Inferred);
    assert_eq!(write.added_evidence.len(), 1);
    assert_eq!(write.tool_output_id, None);
}
