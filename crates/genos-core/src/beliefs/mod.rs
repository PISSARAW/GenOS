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
#[cfg(test)]
mod evidence_tests;
#[cfg(test)]
mod provenance_tests;

pub mod evidence;
pub mod provenance;
pub mod write;

pub use crate::events::AgentEventType;
pub use evidence::*;
pub use provenance::*;
pub use write::*;

use crate::ids::{BeliefId, ToolOutputId};
use crate::snapshot::AgentSnapshot;
use crate::state::{Belief, BeliefStatus};
use serde::Serialize;
use thiserror::Error;

/// Errors a belief operation can surface. Kept narrow on purpose — anything
/// else (deserialization, storage) still uses the caller's error type.
#[derive(Debug, Error, PartialEq)]
pub enum BeliefError {
    #[error("confidence {0} is not in the unit interval [0.0, 1.0]")]
    ConfidenceOutOfRange(f32),
    #[error("belief ({subject}, {predicate}, {object_value}) already exists on this branch")]
    AlreadyExists {
        subject: String,
        predicate: String,
        object_value: String,
    },
    #[error("evidence cites tool output {tool_output_id} which is not recorded on this branch")]
    UnknownEvidence { tool_output_id: ToolOutputId },
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
    /// Evidence refs actually appended on this write. Empty when no evidence
    /// was supplied (the no-`upsert_belief_with_evidence` path) or when every
    /// ref was already present on the belief (a re-link of the same evidence
    /// dedupes).
    pub added_evidence: Vec<crate::beliefs::evidence::EvidenceRef>,
    /// First `EvidenceRef::ToolOutput` on this write, if any. Surfaced on
    /// `BeliefWrite` and the CLI output as a convenience for callers that
    /// want a single primary tool-output id rather than the whole list.
    pub tool_output_id: Option<ToolOutputId>,
    /// Event carrying the write, already bound to the writer's branch and
    /// numbered at the branch's next sequence.
    pub event: crate::events::AgentEvent,
    /// Optional contradiction marker event. Present only when
    /// [`BeliefWrite::contradictions`] is non-empty — a second
    /// [`AgentEventType::MemoryUpdated`] event whose payload carries
    /// `kind: "contradiction"` plus the opposing ids.
    pub contradiction_event: Option<crate::events::AgentEvent>,
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
