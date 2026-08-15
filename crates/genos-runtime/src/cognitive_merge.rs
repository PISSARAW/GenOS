use chrono::Utc;
use genos_core::{
    checkpoint_snapshot, upsert_belief_at, AgentEvent, AgentEventType, AgentSnapshot, BeliefStatus,
    BranchId, CorrelationId, EventId, EvidenceRef,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveClaim {
    pub claim_id: String,
    pub branch_id: BranchId,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f64,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClaimRelationKind {
    Supports,
    Contradicts,
    Explains,
    Supersedes,
    Qualifies,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClaimRelation {
    pub from_claim: String,
    pub to_claim: String,
    pub kind: ClaimRelationKind,
    pub confidence: f64,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MergeClaimStatus {
    Accepted,
    Disputed,
    Superseded,
    Unresolved,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MergedClaim {
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f64,
    pub supporting_branches: Vec<BranchId>,
    pub source_claims: Vec<String>,
    pub evidence: Vec<String>,
    pub status: MergeClaimStatus,
    pub conflicts_with: Vec<String>,
    pub explained_by: Vec<String>,
    pub qualified_by: Vec<String>,
    pub superseded_by: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveMergeConfig {
    pub acceptance_threshold: f64,
    pub minimum_independent_branches: usize,
}

impl Default for CognitiveMergeConfig {
    fn default() -> Self {
        Self {
            acceptance_threshold: 0.75,
            minimum_independent_branches: 1,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveMergeReport {
    pub candidates: Vec<MergedClaim>,
    pub relations: Vec<ClaimRelation>,
    pub accepted: Vec<String>,
    pub disputed: Vec<String>,
    pub superseded: Vec<String>,
    pub unresolved: Vec<String>,
    pub audit: Vec<String>,
}

type ClaimKey = (String, String, String);

pub fn cognitive_merge(
    claims: &[CognitiveClaim],
    relations: &[ClaimRelation],
    config: &CognitiveMergeConfig,
) -> Result<CognitiveMergeReport, String> {
    validate_inputs(claims, relations, config)?;
    let mut grouped: BTreeMap<ClaimKey, Vec<&CognitiveClaim>> = BTreeMap::new();
    for claim in claims {
        grouped
            .entry((
                claim.subject.clone(),
                claim.predicate.clone(),
                claim.object_value.clone(),
            ))
            .or_default()
            .push(claim);
    }
    let claim_to_key = claims
        .iter()
        .map(|claim| {
            (
                claim.claim_id.clone(),
                (
                    claim.subject.clone(),
                    claim.predicate.clone(),
                    claim.object_value.clone(),
                ),
            )
        })
        .collect::<HashMap<_, _>>();

    let mut candidates = grouped
        .iter()
        .map(|((subject, predicate, object_value), members)| {
            // Repeated observations from one branch are correlated. Only the
            // strongest claim per branch participates in confidence fusion.
            let mut confidence_by_branch = HashMap::<String, f64>::new();
            for claim in members {
                confidence_by_branch
                    .entry(claim.branch_id.0.clone())
                    .and_modify(|confidence| *confidence = confidence.max(claim.confidence))
                    .or_insert(claim.confidence);
            }
            let confidence = 1.0
                - confidence_by_branch
                    .values()
                    .map(|confidence| 1.0 - confidence)
                    .product::<f64>();
            let mut branches = confidence_by_branch
                .into_keys()
                .map(BranchId)
                .collect::<Vec<_>>();
            branches.sort_by(|a, b| a.0.cmp(&b.0));
            branches.dedup();
            let mut evidence = members
                .iter()
                .flat_map(|claim| claim.evidence.clone())
                .collect::<Vec<_>>();
            evidence.sort();
            evidence.dedup();
            MergedClaim {
                subject: subject.clone(),
                predicate: predicate.clone(),
                object_value: object_value.clone(),
                confidence,
                supporting_branches: branches,
                source_claims: members.iter().map(|claim| claim.claim_id.clone()).collect(),
                evidence,
                status: MergeClaimStatus::Unresolved,
                conflicts_with: vec![],
                explained_by: vec![],
                qualified_by: vec![],
                superseded_by: vec![],
            }
        })
        .collect::<Vec<_>>();
    let index = candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| {
            (
                (
                    candidate.subject.clone(),
                    candidate.predicate.clone(),
                    candidate.object_value.clone(),
                ),
                index,
            )
        })
        .collect::<HashMap<_, _>>();

    // Different objects for the same subject/predicate are automatically
    // contradictory. Semantic relations beyond this must be explicit.
    for left in 0..candidates.len() {
        for right in (left + 1)..candidates.len() {
            if candidates[left].subject == candidates[right].subject
                && candidates[left].predicate == candidates[right].predicate
                && candidates[left].object_value != candidates[right].object_value
            {
                let left_name = candidate_name(&candidates[left]);
                let right_name = candidate_name(&candidates[right]);
                candidates[left].conflicts_with.push(right_name);
                candidates[right].conflicts_with.push(left_name);
            }
        }
    }

    for relation in relations {
        let from_key = claim_to_key.get(&relation.from_claim).unwrap();
        let to_key = claim_to_key.get(&relation.to_claim).unwrap();
        let from_index = index[from_key];
        let to_index = index[to_key];
        let from_name = candidate_name(&candidates[from_index]);
        let to_name = candidate_name(&candidates[to_index]);
        let relation_evidence = relation
            .evidence
            .iter()
            .map(|evidence| format!("relation:{}:{evidence}", relation.from_claim))
            .collect::<Vec<_>>();
        match relation.kind {
            ClaimRelationKind::Contradicts => {
                if relation.confidence >= config.acceptance_threshold {
                    push_unique(&mut candidates[from_index].conflicts_with, to_name);
                    push_unique(&mut candidates[to_index].conflicts_with, from_name);
                }
                extend_unique(
                    &mut candidates[from_index].evidence,
                    relation_evidence.clone(),
                );
                extend_unique(&mut candidates[to_index].evidence, relation_evidence);
            }
            ClaimRelationKind::Explains => {
                push_unique(&mut candidates[to_index].explained_by, from_name);
                extend_unique(&mut candidates[to_index].evidence, relation_evidence);
            }
            ClaimRelationKind::Supersedes => {
                if relation.confidence >= config.acceptance_threshold {
                    push_unique(&mut candidates[to_index].superseded_by, from_name);
                }
                extend_unique(&mut candidates[to_index].evidence, relation_evidence);
            }
            ClaimRelationKind::Supports => {
                candidates[to_index].confidence = 1.0
                    - (1.0 - candidates[to_index].confidence)
                        * (1.0 - candidates[from_index].confidence * relation.confidence);
                extend_unique(&mut candidates[to_index].evidence, relation_evidence);
            }
            ClaimRelationKind::Qualifies => {
                push_unique(&mut candidates[to_index].qualified_by, from_name);
                extend_unique(&mut candidates[to_index].evidence, relation_evidence);
            }
        }
    }

    for candidate in &mut candidates {
        candidate.status = if !candidate.superseded_by.is_empty() {
            MergeClaimStatus::Superseded
        } else if !candidate.conflicts_with.is_empty() {
            MergeClaimStatus::Disputed
        } else if candidate.confidence >= config.acceptance_threshold
            && candidate.supporting_branches.len() >= config.minimum_independent_branches
            && !candidate.evidence.is_empty()
        {
            MergeClaimStatus::Accepted
        } else {
            MergeClaimStatus::Unresolved
        };
    }

    let names = |status| {
        candidates
            .iter()
            .filter(|candidate| candidate.status == status)
            .map(candidate_name)
            .collect::<Vec<_>>()
    };
    let accepted = names(MergeClaimStatus::Accepted);
    let disputed = names(MergeClaimStatus::Disputed);
    let superseded = names(MergeClaimStatus::Superseded);
    let unresolved = names(MergeClaimStatus::Unresolved);
    let audit = candidates
        .iter()
        .map(|candidate| {
            format!(
                "{} => {:?} confidence={:.3} branches={} conflicts={}",
                candidate_name(candidate),
                candidate.status,
                candidate.confidence,
                candidate.supporting_branches.len(),
                candidate.conflicts_with.len()
            )
        })
        .collect();
    Ok(CognitiveMergeReport {
        candidates,
        relations: relations.to_vec(),
        accepted,
        disputed,
        superseded,
        unresolved,
        audit,
    })
}

fn validate_inputs(
    claims: &[CognitiveClaim],
    relations: &[ClaimRelation],
    config: &CognitiveMergeConfig,
) -> Result<(), String> {
    if claims.is_empty() {
        return Err("cognitive merge requires at least one claim".to_string());
    }
    if !(0.0..=1.0).contains(&config.acceptance_threshold)
        || config.minimum_independent_branches == 0
    {
        return Err("invalid cognitive merge configuration".to_string());
    }
    let mut ids = HashSet::new();
    for claim in claims {
        if !ids.insert(claim.claim_id.clone()) {
            return Err(format!("duplicate claim id {}", claim.claim_id));
        }
        if !(0.0..=1.0).contains(&claim.confidence) || claim.evidence.is_empty() {
            return Err(format!(
                "claim {} needs bounded confidence and evidence",
                claim.claim_id
            ));
        }
    }
    for relation in relations {
        if !ids.contains(&relation.from_claim)
            || !ids.contains(&relation.to_claim)
            || !(0.0..=1.0).contains(&relation.confidence)
            || relation.evidence.is_empty()
        {
            return Err("relation references unknown claims or lacks evidence".to_string());
        }
    }
    Ok(())
}

fn candidate_name(candidate: &MergedClaim) -> String {
    format!(
        "{}:{}={}",
        candidate.subject, candidate.predicate, candidate.object_value
    )
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

fn extend_unique(values: &mut Vec<String>, additions: Vec<String>) {
    for addition in additions {
        push_unique(values, addition);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CognitiveMergeApplication {
    pub snapshot: AgentSnapshot,
    pub events: Vec<AgentEvent>,
}

/// Apply a reviewed merge report to a fresh checkpoint on the parent branch.
/// Accepted claims become verified beliefs; disputes remain disputed;
/// superseded claims remain rejected for auditability.
pub fn apply_cognitive_merge(
    parent: &AgentSnapshot,
    report: &CognitiveMergeReport,
) -> CognitiveMergeApplication {
    let checkpoint = checkpoint_snapshot(parent);
    let mut snapshot = checkpoint.snapshot;
    let mut events = vec![checkpoint.event];
    for candidate in &report.candidates {
        let status = match candidate.status {
            MergeClaimStatus::Accepted => BeliefStatus::Verified,
            MergeClaimStatus::Disputed => BeliefStatus::Disputed,
            MergeClaimStatus::Superseded => BeliefStatus::Rejected,
            MergeClaimStatus::Unresolved => BeliefStatus::Hypothesis,
        };
        let write = upsert_belief_at(
            &mut snapshot,
            &candidate.subject,
            &candidate.predicate,
            &candidate.object_value,
            candidate.confidence as f32,
            status,
            Utc::now(),
        );
        if let Some(belief) = snapshot
            .state
            .beliefs
            .iter_mut()
            .find(|belief| belief.id == write.belief_id)
        {
            belief
                .evidence
                .extend(
                    candidate
                        .evidence
                        .iter()
                        .cloned()
                        .map(|text| EvidenceRef::Note {
                            text: format!("cognitive_merge:{text}"),
                        }),
                );
        }
        events.push(write.event);
        if let Some(event) = write.contradiction_event {
            events.push(event);
        }
    }
    let sequence = snapshot.state.event_cursor.sequence + 1;
    let event = AgentEvent {
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
            "source_branches": report.candidates.iter().flat_map(|candidate| candidate.supporting_branches.iter().map(|branch| branch.0.clone())).collect::<HashSet<_>>(),
        }),
        causation_id: snapshot.state.event_cursor.last_event_id.clone(),
        correlation_id: Some(CorrelationId::new()),
    };
    snapshot.state.event_cursor.sequence = sequence;
    snapshot.state.event_cursor.last_event_id = Some(event.event_id.clone());
    events.push(event);
    CognitiveMergeApplication { snapshot, events }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claim(
        id: &str,
        branch: &str,
        subject: &str,
        predicate: &str,
        object: &str,
        confidence: f64,
    ) -> CognitiveClaim {
        CognitiveClaim {
            claim_id: id.to_string(),
            branch_id: BranchId(branch.to_string()),
            subject: subject.to_string(),
            predicate: predicate.to_string(),
            object_value: object.to_string(),
            confidence,
            evidence: vec![format!("eval:{id}")],
        }
    }

    #[test]
    fn contradictory_redis_claims_stay_disputed_while_root_cause_is_accepted() {
        let claims = vec![
            claim("a", "A", "redis", "necessary", "false", 0.9),
            claim("b", "B", "redis", "necessary", "true", 0.95),
            claim("c", "C", "contention", "root_cause", "postgresql", 0.92),
        ];
        let report = cognitive_merge(&claims, &[], &CognitiveMergeConfig::default()).unwrap();
        assert_eq!(report.disputed.len(), 2);
        assert_eq!(report.accepted, vec!["contention:root_cause=postgresql"]);
        assert!(report
            .candidates
            .iter()
            .all(|candidate| !candidate.evidence.is_empty()));
    }

    #[test]
    fn parent_receives_beliefs_not_a_union_of_branch_memories() {
        let parent = crate::test_support::snapshot();
        let claims = vec![
            claim("a", "A", "redis", "necessary", "false", 0.9),
            claim("b", "B", "redis", "necessary", "true", 0.95),
            claim("c", "C", "contention", "root_cause", "postgresql", 0.92),
        ];
        let report = cognitive_merge(&claims, &[], &CognitiveMergeConfig::default()).unwrap();
        let application = apply_cognitive_merge(&parent, &report);
        assert!(application.snapshot.state.memories.is_empty());
        assert_eq!(application.snapshot.state.beliefs.len(), 3);
        assert_eq!(
            application
                .snapshot
                .state
                .beliefs
                .iter()
                .filter(|belief| belief.status == BeliefStatus::Disputed)
                .count(),
            2
        );
        assert!(application
            .events
            .iter()
            .any(|event| event.event_type == AgentEventType::CognitiveMergeApplied));
    }

    #[test]
    fn duplicate_claims_from_one_branch_do_not_fake_independent_confirmation() {
        let claims = vec![
            claim("a1", "A", "database", "healthy", "true", 0.6),
            claim("a2", "A", "database", "healthy", "true", 0.7),
        ];
        let report = cognitive_merge(
            &claims,
            &[],
            &CognitiveMergeConfig {
                acceptance_threshold: 0.75,
                minimum_independent_branches: 1,
            },
        )
        .unwrap();
        assert_eq!(report.candidates[0].confidence, 0.7);
        assert_eq!(report.candidates[0].status, MergeClaimStatus::Unresolved);
        assert_eq!(report.candidates[0].supporting_branches.len(), 1);
    }
}
