use chrono::Utc;
use genos_core::{
    checkpoint_snapshot, upsert_belief_at, AgentEvent, AgentEventType, AgentSnapshot, BeliefStatus,
    BranchId, CorrelationId, EventId, EvidenceRef,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Clone, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EpistemicKind {
    Fact,
    #[default]
    Hypothesis,
    Observation,
    Contradiction,
    Preference,
    Result,
    Discovery,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveClaim {
    pub claim_id: String,
    pub branch_id: BranchId,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f64,
    pub evidence: Vec<String>,
    #[serde(default)]
    pub kind: EpistemicKind,
    #[serde(default)]
    pub statement: String,
    #[serde(default)]
    pub conditions: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExperienceItem {
    pub item_id: String,
    pub description: String,
    #[serde(default)]
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchExperience {
    pub branch_id: BranchId,
    #[serde(default)]
    pub conditions: Vec<String>,
    #[serde(default)]
    pub observations: Vec<ExperienceItem>,
    #[serde(default)]
    pub actions: Vec<ExperienceItem>,
    #[serde(default)]
    pub results: Vec<ExperienceItem>,
    #[serde(default)]
    pub beliefs_created: Vec<CognitiveClaim>,
    #[serde(default)]
    pub beliefs_modified: Vec<CognitiveClaim>,
    #[serde(default)]
    pub failures: Vec<ExperienceItem>,
    #[serde(default)]
    pub discoveries: Vec<ExperienceItem>,
    #[serde(default)]
    pub uncertainty: Vec<ExperienceItem>,
    #[serde(default)]
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
    pub epistemic_kinds: Vec<EpistemicKind>,
    pub statements: Vec<String>,
    pub conditions: Vec<String>,
    pub status: MergeClaimStatus,
    pub conflicts_with: Vec<String>,
    pub explained_by: Vec<String>,
    pub qualified_by: Vec<String>,
    pub superseded_by: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CognitiveGraphNodeKind {
    Concept,
    Claim,
    Branch,
    Observation,
    Action,
    Result,
    Failure,
    Discovery,
    Uncertainty,
    Evidence,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveGraphNode {
    pub node_id: String,
    pub kind: CognitiveGraphNodeKind,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CognitiveGraphEdgeKind {
    Asserts,
    CreatesBelief,
    ModifiesBelief,
    Observes,
    Performs,
    Produces,
    FailsWith,
    Discovers,
    IsUncertainAbout,
    EvidenceFor,
    About,
    Supports,
    Contradicts,
    Explains,
    Supersedes,
    Qualifies,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveGraphEdge {
    pub from: String,
    pub to: String,
    pub kind: CognitiveGraphEdgeKind,
    pub confidence: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveGraph {
    pub nodes: Vec<CognitiveGraphNode>,
    pub edges: Vec<CognitiveGraphEdge>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ContextualConclusion {
    pub claim: String,
    pub statement: String,
    pub status: MergeClaimStatus,
    pub conditions: Vec<String>,
    pub source_branches: Vec<BranchId>,
    pub confidence: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeSynthesis {
    pub topics: Vec<String>,
    pub summary: String,
    pub conclusions: Vec<ContextualConclusion>,
    pub residual_conflicts: Vec<String>,
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
    pub graph: CognitiveGraph,
    pub syntheses: Vec<KnowledgeSynthesis>,
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
    let graph = build_cognitive_graph(&candidates, relations, &claim_to_key);
    let syntheses = synthesize_contextual_knowledge(&candidates);
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

fn add_experiences_to_graph(graph: &mut CognitiveGraph, experiences: &[BranchExperience]) {
    for experience in experiences {
        let branch_node = format!("branch:{}", experience.branch_id.0);
        if !graph.nodes.iter().any(|node| node.node_id == branch_node) {
            graph.nodes.push(CognitiveGraphNode {
                node_id: branch_node.clone(),
                kind: CognitiveGraphNodeKind::Branch,
                label: experience.branch_id.0.clone(),
            });
        }
        add_experience_items(
            graph,
            &branch_node,
            &experience.observations,
            CognitiveGraphNodeKind::Observation,
            CognitiveGraphEdgeKind::Observes,
        );
        add_experience_items(
            graph,
            &branch_node,
            &experience.actions,
            CognitiveGraphNodeKind::Action,
            CognitiveGraphEdgeKind::Performs,
        );
        add_experience_items(
            graph,
            &branch_node,
            &experience.results,
            CognitiveGraphNodeKind::Result,
            CognitiveGraphEdgeKind::Produces,
        );
        add_experience_items(
            graph,
            &branch_node,
            &experience.failures,
            CognitiveGraphNodeKind::Failure,
            CognitiveGraphEdgeKind::FailsWith,
        );
        add_experience_items(
            graph,
            &branch_node,
            &experience.discoveries,
            CognitiveGraphNodeKind::Discovery,
            CognitiveGraphEdgeKind::Discovers,
        );
        add_experience_items(
            graph,
            &branch_node,
            &experience.uncertainty,
            CognitiveGraphNodeKind::Uncertainty,
            CognitiveGraphEdgeKind::IsUncertainAbout,
        );
        add_belief_lifecycle_edges(
            graph,
            &branch_node,
            &experience.beliefs_created,
            CognitiveGraphEdgeKind::CreatesBelief,
        );
        add_belief_lifecycle_edges(
            graph,
            &branch_node,
            &experience.beliefs_modified,
            CognitiveGraphEdgeKind::ModifiesBelief,
        );
        for (index, evidence) in experience.evidence.iter().enumerate() {
            let evidence_node = format!("evidence:{}:packet:{index}", experience.branch_id.0);
            graph.nodes.push(CognitiveGraphNode {
                node_id: evidence_node.clone(),
                kind: CognitiveGraphNodeKind::Evidence,
                label: evidence.clone(),
            });
            graph.edges.push(CognitiveGraphEdge {
                from: evidence_node,
                to: branch_node.clone(),
                kind: CognitiveGraphEdgeKind::EvidenceFor,
                confidence: 1.0,
            });
        }
    }
    graph
        .nodes
        .sort_by(|left, right| left.node_id.cmp(&right.node_id));
}

fn add_experience_items(
    graph: &mut CognitiveGraph,
    branch_node: &str,
    items: &[ExperienceItem],
    node_kind: CognitiveGraphNodeKind,
    edge_kind: CognitiveGraphEdgeKind,
) {
    for item in items {
        let item_node = format!("{branch_node}:{}", item.item_id);
        graph.nodes.push(CognitiveGraphNode {
            node_id: item_node.clone(),
            kind: node_kind.clone(),
            label: item.description.clone(),
        });
        graph.edges.push(CognitiveGraphEdge {
            from: branch_node.to_string(),
            to: item_node.clone(),
            kind: edge_kind.clone(),
            confidence: 1.0,
        });
        for (index, evidence) in item.evidence.iter().enumerate() {
            let evidence_node = format!("{item_node}:evidence:{index}");
            graph.nodes.push(CognitiveGraphNode {
                node_id: evidence_node.clone(),
                kind: CognitiveGraphNodeKind::Evidence,
                label: evidence.clone(),
            });
            graph.edges.push(CognitiveGraphEdge {
                from: evidence_node,
                to: item_node.clone(),
                kind: CognitiveGraphEdgeKind::EvidenceFor,
                confidence: 1.0,
            });
        }
    }
}

fn add_belief_lifecycle_edges(
    graph: &mut CognitiveGraph,
    branch_node: &str,
    claims: &[CognitiveClaim],
    kind: CognitiveGraphEdgeKind,
) {
    for claim in claims {
        graph.edges.push(CognitiveGraphEdge {
            from: branch_node.to_string(),
            to: format!(
                "{}:{}={}",
                claim.subject, claim.predicate, claim.object_value
            ),
            kind: kind.clone(),
            confidence: claim.confidence,
        });
    }
}

fn build_cognitive_graph(
    candidates: &[MergedClaim],
    relations: &[ClaimRelation],
    claim_to_key: &HashMap<String, ClaimKey>,
) -> CognitiveGraph {
    let mut nodes = BTreeMap::<String, CognitiveGraphNode>::new();
    let mut edges = Vec::new();
    for candidate in candidates {
        let claim_node = candidate_name(candidate);
        let concept_node = format!("concept:{}", candidate.subject);
        nodes
            .entry(claim_node.clone())
            .or_insert(CognitiveGraphNode {
                node_id: claim_node.clone(),
                kind: CognitiveGraphNodeKind::Claim,
                label: candidate.statements.join(" | "),
            });
        nodes
            .entry(concept_node.clone())
            .or_insert(CognitiveGraphNode {
                node_id: concept_node.clone(),
                kind: CognitiveGraphNodeKind::Concept,
                label: candidate.subject.clone(),
            });
        edges.push(CognitiveGraphEdge {
            from: claim_node.clone(),
            to: concept_node,
            kind: CognitiveGraphEdgeKind::About,
            confidence: candidate.confidence,
        });
        for branch in &candidate.supporting_branches {
            let branch_node = format!("branch:{}", branch.0);
            nodes
                .entry(branch_node.clone())
                .or_insert(CognitiveGraphNode {
                    node_id: branch_node.clone(),
                    kind: CognitiveGraphNodeKind::Branch,
                    label: branch.0.clone(),
                });
            edges.push(CognitiveGraphEdge {
                from: branch_node,
                to: claim_node.clone(),
                kind: CognitiveGraphEdgeKind::Asserts,
                confidence: candidate.confidence,
            });
        }
    }

    let candidate_by_key = candidates
        .iter()
        .map(|candidate| {
            (
                (
                    candidate.subject.clone(),
                    candidate.predicate.clone(),
                    candidate.object_value.clone(),
                ),
                candidate_name(candidate),
            )
        })
        .collect::<HashMap<_, _>>();
    for relation in relations {
        let from = candidate_by_key[&claim_to_key[&relation.from_claim]].clone();
        let to = candidate_by_key[&claim_to_key[&relation.to_claim]].clone();
        edges.push(CognitiveGraphEdge {
            from,
            to,
            kind: match relation.kind {
                ClaimRelationKind::Supports => CognitiveGraphEdgeKind::Supports,
                ClaimRelationKind::Contradicts => CognitiveGraphEdgeKind::Contradicts,
                ClaimRelationKind::Explains => CognitiveGraphEdgeKind::Explains,
                ClaimRelationKind::Supersedes => CognitiveGraphEdgeKind::Supersedes,
                ClaimRelationKind::Qualifies => CognitiveGraphEdgeKind::Qualifies,
            },
            confidence: relation.confidence,
        });
    }

    // Same-predicate contradictions need an edge even when callers did not
    // provide an explicit semantic relation.
    let mut explicit_conflicts = HashSet::new();
    for edge in &edges {
        if edge.kind == CognitiveGraphEdgeKind::Contradicts {
            explicit_conflicts.insert((edge.from.clone(), edge.to.clone()));
            explicit_conflicts.insert((edge.to.clone(), edge.from.clone()));
        }
    }
    for candidate in candidates {
        let from = candidate_name(candidate);
        for to in &candidate.conflicts_with {
            if from < *to && !explicit_conflicts.contains(&(from.clone(), to.clone())) {
                edges.push(CognitiveGraphEdge {
                    from: from.clone(),
                    to: to.clone(),
                    kind: CognitiveGraphEdgeKind::Contradicts,
                    confidence: candidate.confidence,
                });
            }
        }
    }

    CognitiveGraph {
        nodes: nodes.into_values().collect(),
        edges,
    }
}

fn synthesize_contextual_knowledge(candidates: &[MergedClaim]) -> Vec<KnowledgeSynthesis> {
    let index = candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| (candidate_name(candidate), index))
        .collect::<HashMap<_, _>>();
    let mut adjacency = vec![Vec::new(); candidates.len()];
    for (candidate_index, candidate) in candidates.iter().enumerate() {
        for related in candidate
            .conflicts_with
            .iter()
            .chain(&candidate.explained_by)
            .chain(&candidate.qualified_by)
            .chain(&candidate.superseded_by)
        {
            if let Some(related_index) = index.get(related) {
                adjacency[candidate_index].push(*related_index);
                adjacency[*related_index].push(candidate_index);
            }
        }
    }

    let mut visited = vec![false; candidates.len()];
    let mut syntheses = Vec::new();
    for start in 0..candidates.len() {
        if visited[start] {
            continue;
        }
        let mut stack = vec![start];
        let mut component = Vec::new();
        visited[start] = true;
        while let Some(current) = stack.pop() {
            component.push(current);
            for next in &adjacency[current] {
                if !visited[*next] {
                    visited[*next] = true;
                    stack.push(*next);
                }
            }
        }
        component.sort_unstable();
        let mut conclusions = component
            .iter()
            .map(|index| {
                let candidate = &candidates[*index];
                ContextualConclusion {
                    claim: candidate_name(candidate),
                    statement: candidate.statements.join(" / "),
                    status: candidate.status.clone(),
                    conditions: candidate.conditions.clone(),
                    source_branches: candidate.supporting_branches.clone(),
                    confidence: candidate.confidence,
                }
            })
            .collect::<Vec<_>>();
        conclusions.sort_by(|left, right| left.claim.cmp(&right.claim));
        let summary = conclusions
            .iter()
            .map(|conclusion| {
                let context = if conclusion.conditions.is_empty() {
                    conclusion
                        .source_branches
                        .iter()
                        .map(|branch| branch.0.clone())
                        .collect::<Vec<_>>()
                        .join(", ")
                } else {
                    conclusion.conditions.join(", ")
                };
                format!(
                    "Under {context}: {} [{:?}, confidence {:.2}]",
                    conclusion.statement, conclusion.status, conclusion.confidence
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        let mut topics = component
            .iter()
            .map(|index| candidates[*index].subject.clone())
            .collect::<Vec<_>>();
        topics.sort();
        topics.dedup();
        let mut residual_conflicts = component
            .iter()
            .flat_map(|index| {
                let from = candidate_name(&candidates[*index]);
                let from_for_filter = from.clone();
                candidates[*index]
                    .conflicts_with
                    .iter()
                    .filter(move |to| from_for_filter < **to)
                    .map(move |to| format!("{from} <> {to}"))
            })
            .collect::<Vec<_>>();
        residual_conflicts.sort();
        residual_conflicts.dedup();
        syntheses.push(KnowledgeSynthesis {
            topics,
            summary,
            conclusions,
            residual_conflicts,
        });
    }
    syntheses
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
                        .epistemic_kinds
                        .iter()
                        .map(|kind| EvidenceRef::Note {
                            text: format!("cognitive_merge:epistemic_kind:{kind:?}"),
                        }),
                );
            belief
                .evidence
                .extend(
                    candidate
                        .conditions
                        .iter()
                        .map(|condition| EvidenceRef::Note {
                            text: format!("cognitive_merge:condition:{condition}"),
                        }),
                );
            belief
                .evidence
                .extend(
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
            kind: EpistemicKind::Hypothesis,
            statement: format!("{subject} {predicate} {object}"),
            conditions: vec![],
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

    #[test]
    fn experience_packets_build_a_typed_graph_and_contextual_synthesis() {
        let mut a = claim("a", "A", "redis", "useful", "false", 0.9);
        a.statement = "Redis appears unnecessary".to_string();
        a.kind = EpistemicKind::Result;
        let mut b = claim("b", "B", "redis", "useful", "true", 0.95);
        b.statement = "Redis reduces contention".to_string();
        b.kind = EpistemicKind::Observation;
        let mut c = claim("c", "C", "contention", "root_cause", "postgresql", 0.92);
        c.statement = "PostgreSQL storage behavior is the likely root cause".to_string();
        c.kind = EpistemicKind::Discovery;
        let packet = |branch: &str, conditions: &[&str], belief: CognitiveClaim| BranchExperience {
            branch_id: BranchId(branch.to_string()),
            conditions: conditions.iter().map(|value| value.to_string()).collect(),
            observations: vec![ExperienceItem {
                item_id: format!("observation-{branch}"),
                description: "measured lock contention".to_string(),
                evidence: vec![format!("trace-{branch}")],
            }],
            actions: vec![],
            results: vec![],
            beliefs_created: vec![belief],
            beliefs_modified: vec![],
            failures: vec![],
            discoveries: vec![],
            uncertainty: vec![],
            evidence: vec![format!("experiment-{branch}")],
        };
        let experiences = vec![
            packet("A", &["baseline without Redis"], a),
            packet("B", &["high write contention with Redis"], b),
            packet("C", &["PostgreSQL lock analysis"], c),
        ];
        let relations = vec![
            ClaimRelation {
                from_claim: "a".to_string(),
                to_claim: "b".to_string(),
                kind: ClaimRelationKind::Contradicts,
                confidence: 0.9,
                evidence: vec!["different outcomes".to_string()],
            },
            ClaimRelation {
                from_claim: "c".to_string(),
                to_claim: "b".to_string(),
                kind: ClaimRelationKind::Qualifies,
                confidence: 0.9,
                evidence: vec!["mitigation differs from root cause".to_string()],
            },
        ];
        let report =
            merge_experiences(&experiences, &relations, &CognitiveMergeConfig::default()).unwrap();
        assert!(report
            .graph
            .nodes
            .iter()
            .any(|node| node.kind == CognitiveGraphNodeKind::Observation));
        assert!(report
            .graph
            .edges
            .iter()
            .any(|edge| edge.kind == CognitiveGraphEdgeKind::CreatesBelief));
        let synthesis = report
            .syntheses
            .iter()
            .find(|synthesis| synthesis.topics.contains(&"redis".to_string()))
            .unwrap();
        assert_eq!(synthesis.conclusions.len(), 3);
        assert!(synthesis.summary.contains("baseline without Redis"));
        assert!(synthesis.summary.contains("PostgreSQL storage behavior"));
        assert_eq!(synthesis.residual_conflicts.len(), 1);
    }

    #[test]
    fn preferences_remain_hypotheses_and_context_survives_parent_application() {
        let parent = crate::test_support::snapshot();
        let mut preference = claim("p", "A", "database", "preferred", "postgresql", 0.95);
        preference.kind = EpistemicKind::Preference;
        preference.statement = "PostgreSQL is preferred for operational simplicity".to_string();
        preference.conditions = vec!["small operations team".to_string()];
        let report = cognitive_merge(&[preference], &[], &CognitiveMergeConfig::default()).unwrap();
        let application = apply_cognitive_merge(&parent, &report);
        let belief = &application.snapshot.state.beliefs[0];
        assert_eq!(belief.status, BeliefStatus::Hypothesis);
        assert!(belief.evidence.iter().any(|evidence| matches!(
            evidence,
            EvidenceRef::Note { text } if text == "cognitive_merge:condition:small operations team"
        )));
    }
}
