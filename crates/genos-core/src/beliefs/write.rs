//! Belief write API.
//!
//! Extracted from `mod.rs` so the public surface stays under the 400-line rule.
//! Two write paths exist:
//!
//! - [`upsert_belief`] / [`upsert_belief_at`] — pure upsert by triple, no
//!   evidence. Contradiction detection runs here (same `(subject, predicate)`,
//!   different `object_value`).
//! - [`upsert_belief_with_evidence`] — same shape plus typed evidence links.
//!   Validates each `EvidenceRef::ToolOutput` against the branch's tool outputs
//!   and dedupes re-linked refs.
//!
//! [`add_belief`] is the explicit "fail if exists" variant.

use super::{BeliefError, BeliefWrite, BeliefWriteKind};
use crate::events::{AgentEvent, AgentEventType};
use crate::evidence::EvidenceRef;
use crate::ids::{BeliefId, EventId};
use crate::snapshot::AgentSnapshot;
use crate::state::{Belief, BeliefStatus};
use chrono::{DateTime, Utc};
use serde_json::json;

/// Insert-or-update a belief by triple and stamp an event on this branch.
///
/// First call with a given `(subject, predicate, object_value)` creates a
/// [`Belief`] with a fresh [`BeliefId`], event [`AgentEventType::MemoryCreated`].
/// Subsequent calls with the same triple on the same branch return
/// [`BeliefWriteKind::Updated`], overwrite `confidence` (and the `status`
/// carried by the caller, if [`BeliefStatus`] is not the default) in place,
/// and emit [`AgentEventType::MemoryUpdated`].
pub fn upsert_belief(
    snapshot: &mut AgentSnapshot,
    subject: &str,
    predicate: &str,
    object_value: &str,
    confidence: f32,
) -> BeliefWrite {
    upsert_belief_at(
        snapshot,
        subject,
        predicate,
        object_value,
        confidence,
        BeliefStatus::Observation,
        Utc::now(),
    )
}

/// [`upsert_belief`] with an explicit status and timestamp, for deterministic
/// tests and callers that need to pin a belief as `Hypothesis` rather than
/// `Observation`.
#[allow(clippy::too_many_arguments)]
pub fn upsert_belief_at(
    snapshot: &mut AgentSnapshot,
    subject: &str,
    predicate: &str,
    object_value: &str,
    confidence: f32,
    status: BeliefStatus,
    timestamp: DateTime<Utc>,
) -> BeliefWrite {
    assert_unit_confidence(confidence);

    let existing = snapshot.state.beliefs.iter_mut().find(|belief| {
        belief.subject == subject
            && belief.predicate == predicate
            && belief.object_value == object_value
    });

    let (kind, belief_id, previous_confidence) = match existing {
        Some(belief) => {
            let previous = belief.confidence;
            belief.confidence = confidence;
            belief.status = status.clone();
            (BeliefWriteKind::Updated, belief.id.clone(), Some(previous))
        }
        None => {
            let id = BeliefId::new();
            let belief = Belief {
                id: id.clone(),
                subject: subject.to_string(),
                predicate: predicate.to_string(),
                object_value: object_value.to_string(),
                confidence,
                status: status.clone(),
                evidence: Vec::new(),
                contradicts: vec![],
                created_in: snapshot.branch_id.clone(),
                created_at: timestamp,
            };
            snapshot.state.beliefs.push(belief);
            (BeliefWriteKind::Added, id, None)
        }
    };

    let sequence = snapshot.state.event_cursor.sequence + 1;
    let event_type = match kind {
        BeliefWriteKind::Added => AgentEventType::BeliefCreated,
        BeliefWriteKind::Updated => AgentEventType::MemoryUpdated,
    };

    let payload = json!({
        "belief_id": belief_id,
        "subject": subject,
        "predicate": predicate,
        "object_value": object_value,
        "confidence": confidence,
        "previous_confidence": previous_confidence,
    });

    let event = AgentEvent {
        event_id: EventId::new(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: Some(snapshot.branch_id.clone()),
        sequence,
        timestamp,
        event_type,
        payload,
        causation_id: None,
        correlation_id: None,
    };

    snapshot.state.event_cursor.sequence = sequence;
    snapshot.state.event_cursor.last_event_id = Some(event.event_id.clone());

    // Contradiction detection runs only on `Added`: same `(subject, predicate)`
    // with a different `object_value` is the disagreement signal. A confidence
    // update on an existing triple is not a contradiction — the existing rule
    // stays tight.
    let (contradictions, contradiction_event) = if kind == BeliefWriteKind::Added {
        let opposing: Vec<BeliefId> = snapshot
            .state
            .beliefs
            .iter()
            .filter(|belief| {
                belief.subject == subject
                    && belief.predicate == predicate
                    && belief.object_value != object_value
            })
            .map(|belief| belief.id.clone())
            .collect();

        if opposing.is_empty() {
            (vec![], None)
        } else {
            // Link the new belief to each opposing id, flip its status to
            // `Disputed`, and flip the existing beliefs' status the same way.
            // Both records go `Disputed` because each disproves the other.
            let new_belief_index = snapshot
                .state
                .beliefs
                .iter()
                .position(|belief| belief.id == belief_id)
                .expect("just-added belief must be in state");
            snapshot.state.beliefs[new_belief_index].status = BeliefStatus::Disputed;
            snapshot.state.beliefs[new_belief_index]
                .contradicts
                .extend(opposing.iter().cloned());

            for opposing_id in &opposing {
                if let Some(existing) = snapshot
                    .state
                    .beliefs
                    .iter_mut()
                    .find(|belief| &belief.id == opposing_id)
                {
                    existing.status = BeliefStatus::Disputed;
                    if !existing.contradicts.contains(&belief_id) {
                        existing.contradicts.push(belief_id.clone());
                    }
                }
            }

            let contradiction_sequence = snapshot.state.event_cursor.sequence + 1;
            let contradiction_payload = json!({
                "kind": "contradiction",
                "with": opposing,
                "subject": subject,
                "predicate": predicate,
                "new_belief_id": belief_id,
                "new_object_value": object_value,
            });
            let contradiction_marker = AgentEvent {
                event_id: EventId::new(),
                agent_id: snapshot.agent_id.clone(),
                branch_id: Some(snapshot.branch_id.clone()),
                sequence: contradiction_sequence,
                timestamp,
                event_type: AgentEventType::MemoryUpdated,
                payload: contradiction_payload,
                causation_id: Some(event.event_id.clone()),
                correlation_id: None,
            };

            snapshot.state.event_cursor.sequence = contradiction_sequence;
            snapshot.state.event_cursor.last_event_id = Some(contradiction_marker.event_id.clone());

            // The believer's status on the response mirrors its persisted
            // status: `Disputed` when this write triggered a contradiction,
            // whatever the caller passed otherwise.
            (opposing, Some(contradiction_marker))
        }
    } else {
        (vec![], None)
    };

    let written_status = if contradictions.is_empty() {
        status
    } else {
        BeliefStatus::Disputed
    };

    BeliefWrite {
        belief_id,
        subject: subject.to_string(),
        predicate: predicate.to_string(),
        object_value: object_value.to_string(),
        confidence,
        previous_confidence,
        status: written_status,
        kind,
        contradictions,
        // `upsert_belief_at` is the no-evidence path; `upsert_belief_with_evidence`
        // post-fills these fields with the linked refs.
        added_evidence: Vec::new(),
        tool_output_id: None,
        event,
        contradiction_event,
    }
}

fn assert_unit_confidence(confidence: f32) {
    assert!(
        (0.0..=1.0).contains(&confidence),
        "confidence {confidence} is not in the unit interval [0.0, 1.0]"
    );
}

/// Explicit add helper. Fails if a belief with the same triple already exists
/// on this branch; use [`upsert_belief`] when "create or update" is what you
/// mean.
pub fn add_belief(
    snapshot: &mut AgentSnapshot,
    subject: &str,
    predicate: &str,
    object_value: &str,
    confidence: f32,
    status: BeliefStatus,
) -> Result<BeliefWrite, BeliefError> {
    assert_unit_confidence_check(confidence)?;
    if snapshot
        .find_belief(subject, predicate, object_value)
        .is_some()
    {
        return Err(BeliefError::AlreadyExists {
            subject: subject.to_string(),
            predicate: predicate.to_string(),
            object_value: object_value.to_string(),
        });
    }
    Ok(upsert_belief_at(
        snapshot,
        subject,
        predicate,
        object_value,
        confidence,
        status,
        Utc::now(),
    ))
}

fn assert_unit_confidence_check(confidence: f32) -> Result<(), BeliefError> {
    if !(0.0..=1.0).contains(&confidence) {
        Err(BeliefError::ConfidenceOutOfRange(confidence))
    } else {
        Ok(())
    }
}

/// Insert-or-update a belief by triple and link the supplied evidence.
///
/// On top of [`upsert_belief_at`], this:
///
/// - Validates every `EvidenceRef::ToolOutput` is recorded on this branch
///   (else [`BeliefError::UnknownEvidence`]). Notes are accepted as-is.
/// - Defaults the new belief's status to [`BeliefStatus::Inferred`] when
///   `evidence` is non-empty and the caller passed `None`. An explicit
///   `Some(status)` always wins.
/// - Dedupes evidence: a ref already on the belief is left alone; only newly
///   linked refs end up on [`BeliefWrite::added_evidence`].
///
/// The five-arg [`upsert_belief`] (and its CLI's no-`--evidence` path) is
/// unchanged for back-compat: it constructs a [`BeliefWrite`] with empty
/// `added_evidence` and `None` tool output id.
#[allow(clippy::too_many_arguments)]
pub fn upsert_belief_with_evidence(
    snapshot: &mut AgentSnapshot,
    subject: &str,
    predicate: &str,
    object_value: &str,
    confidence: f32,
    evidence: Vec<EvidenceRef>,
    explicit_status: Option<BeliefStatus>,
) -> Result<BeliefWrite, BeliefError> {
    assert_unit_confidence_check(confidence)?;

    // Pre-flight: every ToolOutput ref must exist on this branch.
    for reference in &evidence {
        if let Some(tool_output_id) = reference.tool_output_id() {
            if snapshot.tool_output(tool_output_id).is_none() {
                return Err(BeliefError::UnknownEvidence {
                    tool_output_id: tool_output_id.clone(),
                });
            }
        }
    }

    // Status resolution: caller wins; otherwise Observation when evidence is
    // empty, Inferred otherwise. A no-evidence write should not silently
    // flip a previously-`Verified` belief to `Inferred`.
    let resolved_status = explicit_status.unwrap_or(if evidence.is_empty() {
        BeliefStatus::Observation
    } else {
        BeliefStatus::Inferred
    });

    let mut write = upsert_belief_at(
        snapshot,
        subject,
        predicate,
        object_value,
        confidence,
        resolved_status,
        Utc::now(),
    );

    // Append new evidence, deduping. Mirrors the `contradicts` dedup in
    // `upsert_belief_at`.
    if !evidence.is_empty() {
        let belief_id = write.belief_id.clone();
        let belief = snapshot
            .state
            .beliefs
            .iter_mut()
            .find(|b| b.id == belief_id)
            .expect("just-written belief must exist");
        let mut added = Vec::new();
        for reference in evidence {
            if !belief.evidence.contains(&reference) {
                belief.evidence.push(reference.clone());
                added.push(reference);
            }
        }
        write.added_evidence = added.clone();
        write.tool_output_id = added.iter().find_map(|r| r.tool_output_id().cloned());
    }

    Ok(write)
}
