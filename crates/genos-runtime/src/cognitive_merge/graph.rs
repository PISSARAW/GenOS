use std::collections::{BTreeMap, HashMap, HashSet};

use super::types::{
    BranchExperience, ClaimKey, ClaimRelation, ClaimRelationKind, CognitiveClaim, CognitiveGraph,
    CognitiveGraphEdge, CognitiveGraphEdgeKind, CognitiveGraphNode, CognitiveGraphNodeKind,
    ExperienceItem, MergedClaim,
};

pub(crate) struct ExperienceItemBinding<'a> {
    pub items: &'a [ExperienceItem],
    pub node_kind: CognitiveGraphNodeKind,
    pub edge_kind: CognitiveGraphEdgeKind,
}

pub(crate) struct BeliefLifecycleBinding<'a> {
    pub claims: &'a [CognitiveClaim],
    pub kind: CognitiveGraphEdgeKind,
}

pub(crate) fn add_experiences_to_graph(
    graph: &mut CognitiveGraph,
    experiences: &[BranchExperience],
) {
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
            ExperienceItemBinding {
                items: &experience.observations,
                node_kind: CognitiveGraphNodeKind::Observation,
                edge_kind: CognitiveGraphEdgeKind::Observes,
            },
        );
        add_experience_items(
            graph,
            &branch_node,
            ExperienceItemBinding {
                items: &experience.actions,
                node_kind: CognitiveGraphNodeKind::Action,
                edge_kind: CognitiveGraphEdgeKind::Performs,
            },
        );
        add_experience_items(
            graph,
            &branch_node,
            ExperienceItemBinding {
                items: &experience.results,
                node_kind: CognitiveGraphNodeKind::Result,
                edge_kind: CognitiveGraphEdgeKind::Produces,
            },
        );
        add_experience_items(
            graph,
            &branch_node,
            ExperienceItemBinding {
                items: &experience.failures,
                node_kind: CognitiveGraphNodeKind::Failure,
                edge_kind: CognitiveGraphEdgeKind::FailsWith,
            },
        );
        add_experience_items(
            graph,
            &branch_node,
            ExperienceItemBinding {
                items: &experience.discoveries,
                node_kind: CognitiveGraphNodeKind::Discovery,
                edge_kind: CognitiveGraphEdgeKind::Discovers,
            },
        );
        add_experience_items(
            graph,
            &branch_node,
            ExperienceItemBinding {
                items: &experience.uncertainty,
                node_kind: CognitiveGraphNodeKind::Uncertainty,
                edge_kind: CognitiveGraphEdgeKind::IsUncertainAbout,
            },
        );
        add_belief_lifecycle_edges(
            graph,
            &branch_node,
            BeliefLifecycleBinding {
                claims: &experience.beliefs_created,
                kind: CognitiveGraphEdgeKind::CreatesBelief,
            },
        );
        add_belief_lifecycle_edges(
            graph,
            &branch_node,
            BeliefLifecycleBinding {
                claims: &experience.beliefs_modified,
                kind: CognitiveGraphEdgeKind::ModifiesBelief,
            },
        );
        add_packet_evidence(graph, experience, &branch_node);
    }
    graph
        .nodes
        .sort_by(|left, right| left.node_id.cmp(&right.node_id));
}

fn add_packet_evidence(
    graph: &mut CognitiveGraph,
    experience: &BranchExperience,
    branch_node: &str,
) {
    for (index, evidence) in experience.evidence.iter().enumerate() {
        let evidence_node = format!("evidence:{}:packet:{index}", experience.branch_id.0);
        graph.nodes.push(CognitiveGraphNode {
            node_id: evidence_node.clone(),
            kind: CognitiveGraphNodeKind::Evidence,
            label: evidence.clone(),
        });
        graph.edges.push(CognitiveGraphEdge {
            from: evidence_node,
            to: branch_node.to_string(),
            kind: CognitiveGraphEdgeKind::EvidenceFor,
            confidence: 1.0,
        });
    }
}

pub(crate) fn add_experience_items(
    graph: &mut CognitiveGraph,
    branch_node: &str,
    binding: ExperienceItemBinding<'_>,
) {
    for item in binding.items {
        let item_node = format!("{branch_node}:{}", item.item_id);
        graph.nodes.push(CognitiveGraphNode {
            node_id: item_node.clone(),
            kind: binding.node_kind.clone(),
            label: item.description.clone(),
        });
        graph.edges.push(CognitiveGraphEdge {
            from: branch_node.to_string(),
            to: item_node.clone(),
            kind: binding.edge_kind.clone(),
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

pub(crate) fn add_belief_lifecycle_edges(
    graph: &mut CognitiveGraph,
    branch_node: &str,
    binding: BeliefLifecycleBinding<'_>,
) {
    for claim in binding.claims {
        graph.edges.push(CognitiveGraphEdge {
            from: branch_node.to_string(),
            to: format!(
                "{}:{}={}",
                claim.subject, claim.predicate, claim.object_value
            ),
            kind: binding.kind.clone(),
            confidence: claim.confidence,
        });
    }
}

pub(crate) fn build_cognitive_graph(
    candidates: &[MergedClaim],
    relations: &[ClaimRelation],
    claim_to_key: &HashMap<String, ClaimKey>,
) -> CognitiveGraph {
    let mut nodes = BTreeMap::<String, CognitiveGraphNode>::new();
    let mut edges = Vec::new();
    populate_candidate_nodes(candidates, &mut nodes, &mut edges);

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

    populate_relation_edges(relations, claim_to_key, &candidate_by_key, &mut edges);
    populate_implicit_conflicts(candidates, &mut edges);

    CognitiveGraph {
        nodes: nodes.into_values().collect(),
        edges,
    }
}

fn populate_candidate_nodes(
    candidates: &[MergedClaim],
    nodes: &mut BTreeMap<String, CognitiveGraphNode>,
    edges: &mut Vec<CognitiveGraphEdge>,
) {
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
}

fn populate_relation_edges(
    relations: &[ClaimRelation],
    claim_to_key: &HashMap<String, ClaimKey>,
    candidate_by_key: &HashMap<ClaimKey, String>,
    edges: &mut Vec<CognitiveGraphEdge>,
) {
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
}

fn populate_implicit_conflicts(
    candidates: &[MergedClaim],
    edges: &mut Vec<CognitiveGraphEdge>,
) {
    let mut explicit_conflicts = HashSet::new();
    for edge in edges.iter() {
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
}

pub(crate) fn candidate_name(candidate: &MergedClaim) -> String {
    format!(
        "{}:{}={}",
        candidate.subject, candidate.predicate, candidate.object_value
    )
}
