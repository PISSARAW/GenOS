use std::collections::HashMap;

use super::graph::candidate_name;
use super::types::{ContextualConclusion, KnowledgeSynthesis, MergedClaim};

pub(crate) fn synthesize_contextual_knowledge(
    candidates: &[MergedClaim],
) -> Vec<KnowledgeSynthesis> {
    let index = candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| (candidate_name(candidate), index))
        .collect::<HashMap<_, _>>();
    let adjacency = build_adjacency_graph(candidates, &index);

    let mut visited = vec![false; candidates.len()];
    let mut syntheses = Vec::new();
    for start in 0..candidates.len() {
        if visited[start] {
            continue;
        }
        let component = extract_connected_component(start, &adjacency, &mut visited);
        let conclusions = build_conclusions(&component, candidates);
        let summary = build_summary(&conclusions);
        let topics = extract_topics(&component, candidates);
        let residual_conflicts = extract_residual_conflicts(&component, candidates);

        syntheses.push(KnowledgeSynthesis {
            topics,
            summary,
            conclusions,
            residual_conflicts,
        });
    }
    syntheses
}

fn build_adjacency_graph(
    candidates: &[MergedClaim],
    index: &HashMap<String, usize>,
) -> Vec<Vec<usize>> {
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
    adjacency
}

fn extract_connected_component(
    start: usize,
    adjacency: &[Vec<usize>],
    visited: &mut [bool],
) -> Vec<usize> {
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
    component
}

fn build_conclusions(
    component: &[usize],
    candidates: &[MergedClaim],
) -> Vec<ContextualConclusion> {
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
    conclusions
}

fn build_summary(conclusions: &[ContextualConclusion]) -> String {
    conclusions
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
        .join("; ")
}

fn extract_topics(component: &[usize], candidates: &[MergedClaim]) -> Vec<String> {
    let mut topics = component
        .iter()
        .map(|index| candidates[*index].subject.clone())
        .collect::<Vec<_>>();
    topics.sort();
    topics.dedup();
    topics
}

fn extract_residual_conflicts(
    component: &[usize],
    candidates: &[MergedClaim],
) -> Vec<String> {
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
    residual_conflicts
}
