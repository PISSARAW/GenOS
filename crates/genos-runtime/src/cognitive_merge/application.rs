use chrono::Utc;
use genos_core::{
    checkpoint_snapshot, upsert_belief_at, AgentEvent, AgentEventType, AgentSnapshot, BeliefStatus,
    CorrelationId, EventId, EvidenceRef,
};
use serde_json::json;
use std::collections::HashSet;

use super::types::{
    CognitiveMergeApplication, CognitiveMergeReport, EpistemicKind, MergeClaimStatus, MergedClaim,
};

pub fn apply_cognitive_merge(
    parent: &AgentSnapshot,
    report: &CognitiveMergeReport,
) -> CognitiveMergeApplication {
    let checkpoint = checkpoint_snapshot(parent);
    let mut snapshot = checkpoint.snapshot;
    let mut events = vec![checkpoint.event];

    for candidate in &report.candidates {
        let status = determine_belief_status(candidate);
        let write = upsert_belief_at(
            &mut snapshot,
            &candidate.subject,
            &candidate.predicate,
            &candidate.object_value,
            candidate.confidence as f32,
            status,
            Utc::now(),
        );
        enrich_belief_evidence(&mut snapshot, &write.belief_id, candidate);
        events.push(write.event);
        if let Some(event) = write.contradiction_event {
            events.push(event);
        }
    }

    let sequence = snapshot.state.event_cursor.sequence + 1;
    let merge_event = create_merge_applied_event(&snapshot, report, sequence);
    snapshot.state.event_cursor.sequence = sequence;
    snapshot.state.event_cursor.last_event_id = Some(merge_event.event_id.clone());
    events.push(merge_event);

    CognitiveMergeApplication { snapshot, events }
}

fn determine_belief_status(candidate: &MergedClaim) -> BeliefStatus {
    match candidate.status {
        MergeClaimStatus::Accepted
            if candidate.epistemic_kinds.iter().any(|kind| {
                matches!(
                    kind,
                    EpistemicKind::Fact | EpistemicKind::Result | EpistemicKind::Discovery
                )
            }) =>
        {
            BeliefStatus::Verified
        }
        MergeClaimStatus::Accepted
            if candidate
                .epistemic_kinds
                .contains(&EpistemicKind::Observation) =>
        {
            BeliefStatus::Observation
        }
        MergeClaimStatus::Accepted => BeliefStatus::Hypothesis,
        MergeClaimStatus::Disputed => BeliefStatus::Disputed,
        MergeClaimStatus::Superseded => BeliefStatus::Rejected,
        MergeClaimStatus::Unresolved => BeliefStatus::Hypothesis,
    }
}

fn enrich_belief_evidence(
    snapshot: &mut AgentSnapshot,
    belief_id: &genos_core::BeliefId,
    candidate: &MergedClaim,
) {
    if let Some(belief) = snapshot
        .state
        .beliefs
        .iter_mut()
        .find(|b| b.id == *belief_id)
    {
        belief.evidence.extend(
            candidate
                .epistemic_kinds
                .iter()
                .map(|kind| EvidenceRef::Note {
                    text: format!("cognitive_merge:epistemic_kind:{kind:?}"),
                }),
        );
        belief.evidence.extend(
            candidate
                .conditions
                .iter()
                .map(|condition| EvidenceRef::Note {
                    text: format!("cognitive_merge:condition:{condition}"),
                }),
        );
        belief.evidence.extend(
            candidate
                .statements
                .iter()
                .map(|statement| EvidenceRef::Note {
                    text: format!("cognitive_merge:statement:{statement}"),
                }),
        );
        belief
            .evidence
            .extend(candidate.evidence.iter().map(|text| EvidenceRef::Note {
                text: format!("cognitive_merge:{text}"),
            }));
    }
}

fn create_merge_applied_event(
    snapshot: &AgentSnapshot,
    report: &CognitiveMergeReport,
    sequence: u64,
) -> AgentEvent {
    let source_branches = report
        .candidates
        .iter()
        .flat_map(|candidate| candidate.supporting_branches.iter().map(|b| b.0.clone()))
        .collect::<HashSet<_>>();

    AgentEvent {
        event_id: EventId::new(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: Some(snapshot.branch_id.clone()),
        sequence,
        timestamp: Utc::now(),
        event_type: AgentEventType::CognitiveMergeApplied,
        payload: json!({
            "accepted": report.accepted,
            "disputed": report.disputed,
            "superseded": report.superseded,
            "unresolved": report.unresolved,
            "source_branches": source_branches,
        }),
        causation_id: snapshot.state.event_cursor.last_event_id.clone(),
        correlation_id: Some(CorrelationId::new()),
    }
}
