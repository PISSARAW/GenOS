use genos_core::BranchId;
use std::collections::{BTreeMap, HashMap};

use super::graph::{add_experiences_to_graph, build_cognitive_graph, candidate_name};
use super::synthesis::synthesize_contextual_knowledge;
use super::types::{
    BranchExperience, ClaimKey, ClaimRelation, ClaimRelationKind, CognitiveClaim,
    CognitiveMergeConfig, CognitiveMergeReport, MergeClaimStatus, MergedClaim,
};
use super::validation::validate_inputs;

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

    let mut candidates = build_initial_candidates(&grouped);
    detect_direct_contradictions(&mut candidates);
    apply_semantic_relations(&mut candidates, relations, &claim_to_key, config);
    finalize_candidate_statuses(&mut candidates, config);

    let accepted = extract_names_by_status(&candidates, MergeClaimStatus::Accepted);
    let disputed = extract_names_by_status(&candidates, MergeClaimStatus::Disputed);
    let superseded = extract_names_by_status(&candidates, MergeClaimStatus::Superseded);
    let unresolved = extract_names_by_status(&candidates, MergeClaimStatus::Unresolved);
    let graph = build_cognitive_graph(&candidates, relations, &claim_to_key);
    let syntheses = synthesize_contextual_knowledge(&candidates);
    let audit = build_audit_log(&candidates);

    Ok(CognitiveMergeReport {
        candidates,
        relations: relations.to_vec(),
        accepted,
        disputed,
        superseded,
        unresolved,
        graph,
        syntheses,
        audit,
    })
}

pub fn merge_experiences(
    experiences: &[BranchExperience],
    relations: &[ClaimRelation],
    config: &CognitiveMergeConfig,
) -> Result<CognitiveMergeReport, String> {
    if experiences.is_empty() {
        return Err("cognitive merge requires at least one branch experience".to_string());
    }
    let mut claims = Vec::new();
    for experience in experiences {
        for source in [&experience.beliefs_created, &experience.beliefs_modified] {
            for original in source.iter() {
                if original.branch_id != experience.branch_id {
                    return Err(format!(
                        "claim {} belongs to a different branch than its experience packet",
                        original.claim_id
                    ));
                }
                let mut claim = original.clone();
                extend_unique(&mut claim.conditions, experience.conditions.clone());
                extend_unique(&mut claim.evidence, experience.evidence.clone());
                claims.push(claim);
            }
        }
    }
    let mut report = cognitive_merge(&claims, relations, config)?;
    add_experiences_to_graph(&mut report.graph, experiences);
    Ok(report)
}

fn build_initial_candidates(
    grouped: &BTreeMap<ClaimKey, Vec<&CognitiveClaim>>,
) -> Vec<MergedClaim> {
    grouped
        .iter()
        .map(|((subject, predicate, object_value), members)| {
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
            let mut epistemic_kinds = members
                .iter()
                .map(|claim| claim.kind.clone())
                .collect::<Vec<_>>();
            epistemic_kinds.sort();
            epistemic_kinds.dedup();
            let mut statements = members
                .iter()
                .map(|claim| {
                    if claim.statement.is_empty() {
                        format!("{subject} {predicate} {object_value}")
                    } else {
                        claim.statement.clone()
                    }
                })
                .collect::<Vec<_>>();
            statements.sort();
            statements.dedup();
            let mut conditions = members
                .iter()
                .flat_map(|claim| claim.conditions.clone())
                .collect::<Vec<_>>();
            conditions.sort();
            conditions.dedup();
            MergedClaim {
                subject: subject.clone(),
                predicate: predicate.clone(),
                object_value: object_value.clone(),
                confidence,
                supporting_branches: branches,
                source_claims: members.iter().map(|claim| claim.claim_id.clone()).collect(),
                evidence,
                epistemic_kinds,
                statements,
                conditions,
                status: MergeClaimStatus::Unresolved,
                conflicts_with: vec![],
                explained_by: vec![],
                qualified_by: vec![],
                superseded_by: vec![],
            }
        })
        .collect()
}

fn detect_direct_contradictions(candidates: &mut [MergedClaim]) {
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
}

fn apply_semantic_relations(
    candidates: &mut [MergedClaim],
    relations: &[ClaimRelation],
    claim_to_key: &HashMap<String, ClaimKey>,
    config: &CognitiveMergeConfig,
) {
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
}

fn finalize_candidate_statuses(candidates: &mut [MergedClaim], config: &CognitiveMergeConfig) {
    for candidate in candidates {
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
}

fn extract_names_by_status(candidates: &[MergedClaim], status: MergeClaimStatus) -> Vec<String> {
    candidates
        .iter()
        .filter(|candidate| candidate.status == status)
        .map(candidate_name)
        .collect()
}

fn build_audit_log(candidates: &[MergedClaim]) -> Vec<String> {
    candidates
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
        .collect()
}

pub(crate) fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

pub(crate) fn extend_unique(values: &mut Vec<String>, additions: Vec<String>) {
    for addition in additions {
        push_unique(values, addition);
    }
}
