//! Branch-local beliefs.
//!
//! A belief is a `(subject, predicate, object)` triple tagged with a confidence
//! score. Beliefs live in [`AgentState::beliefs`](crate::state::AgentState::beliefs),
//! which is deep-copied by [`fork_snapshot`](crate::snapshot::fork_snapshot), so a
//! write on one fork is invisible to its siblings and to the parent — exactly
//! the same isolation guarantee that [`variables`](crate::variables) gives
//! working memory.
//!
//! Uniqueness on a branch is by triple: adding a belief whose `(subject,
//! predicate, object_value)` already exists updates that belief's `confidence`
//! in place rather than appending a parallel record. The id stays the same, so
//! the diff keeps treating it as one belief whose `confidence` field changed.

#[cfg(test)]
mod beliefs_tests;
#[cfg(test)]
mod contradiction_tests;

use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{BeliefId, EventId};
use crate::snapshot::AgentSnapshot;
use crate::state::{Belief, BeliefStatus};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::json;
use thiserror::Error;

/// Errors a belief operation can surface. Kept narrow on purpose — anything
/// else (deserialization, storage) still uses the caller's error type.
#[derive(Debug, Error, PartialEq)]
pub enum BeliefError {
    #[error("confidence {0} is not in the unit interval [0.0, 1.0]")]
    ConfidenceOutOfRange(f32),
    #[error(
        "belief ({subject}, {predicate}, {object_value}) already exists on this branch"
    )]
    AlreadyExists {
        subject: String,
        predicate: String,
        object_value: String,
    },
}

/// Whether a call to [`upsert_belief`] created the belief or updated an
/// existing one. Surfaced on [`BeliefWrite::kind`] so callers can pick an event
/// type or update a status field accordingly.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BeliefWriteKind {
    Added,
    Updated,
}

/// What a belief write actually did, with the event that records it.
#[derive(Clone, Debug)]
pub struct BeliefWrite {
    pub belief_id: BeliefId,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f32,
    pub previous_confidence: Option<f32>,
    pub status: BeliefStatus,
    pub kind: BeliefWriteKind,
    /// Belief ids on the same branch that contradict this one — same
    /// `(subject, predicate)`, opposite `object_value`. Empty when the new
    /// belief agrees with everything already recorded, or when the call was an
    /// update of an existing triple (a confidence change isn't a contradiction).
    pub contradictions: Vec<BeliefId>,
    /// Event carrying the write, already bound to the writer's branch and
    /// numbered at the branch's next sequence.
    pub event: AgentEvent,
    /// Optional contradiction marker event. Present only when
    /// [`BeliefWrite::contradictions`] is non-empty — a second
    /// [`AgentEventType::MemoryUpdated`] event whose payload carries
    /// `kind: "contradiction"` plus the opposing ids.
    pub contradiction_event: Option<AgentEvent>,
}

impl AgentSnapshot {
    /// Beliefs held on this snapshot's branch, in insertion order.
    pub fn beliefs(&self) -> &[Belief] {
        &self.state.beliefs
    }

    /// Find a belief by its `(subject, predicate, object_value)` triple on this
    /// branch, or `None` when no such belief exists.
    pub fn find_belief(
        &self,
        subject: &str,
        predicate: &str,
        object_value: &str,
    ) -> Option<&Belief> {
        self.state.beliefs.iter().find(|belief| {
            belief.subject == subject
                && belief.predicate == predicate
                && belief.object_value == object_value
        })
    }

    /// Find beliefs on this branch that disagree with `(subject, predicate,
    /// object_value)`: same `subject` and `predicate`, different `object_value`.
    /// Used by contradiction detection — the rules are "same `(subject,
    /// predicate)`, opposite objects on the same branch" only.
    pub fn find_opposing_beliefs(
        &self,
        subject: &str,
        predicate: &str,
        object_value: &str,
    ) -> Vec<BeliefId> {
        self.state
            .beliefs
            .iter()
            .filter(|belief| {
                belief.subject == subject
                    && belief.predicate == predicate
                    && belief.object_value != object_value
            })
            .map(|belief| belief.id.clone())
            .collect()
    }
}

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

    let existing = snapshot
        .state
        .beliefs
        .iter_mut()
        .find(|belief| {
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
                evidence: vec![],
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
        BeliefWriteKind::Added => AgentEventType::MemoryCreated,
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
            snapshot.state.event_cursor.last_event_id =
                Some(contradiction_marker.event_id.clone());

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
