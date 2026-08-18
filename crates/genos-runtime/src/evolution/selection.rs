use genos_eval::{
    pareto_select, MultiObjectiveBranchScore, ObjectiveDirection, ObjectiveScore, ParetoObjective,
};

use super::types::{
    ArtificialSelectionReport, CanonicalAgentMetrics, ControlledBenchmarkRun, SelectionCandidate,
    SelectionConstraints,
};

pub fn select_controlled_generation(
    runs: &[ControlledBenchmarkRun],
    constraints: &SelectionConstraints,
) -> Result<ArtificialSelectionReport, String> {
    if runs.is_empty() {
        return Err("selection generation has no benchmark runs".to_string());
    }
    let protocol = &runs[0].protocol_id;
    if runs.iter().any(|run| &run.protocol_id != protocol) {
        return Err("benchmark runs use different protocols".to_string());
    }
    let mut genomes = runs
        .iter()
        .map(|run| run.genome_id.clone())
        .collect::<Vec<_>>();
    genomes.sort_by(|a, b| a.0.cmp(&b.0));
    genomes.dedup();

    let candidates = genomes
        .into_iter()
        .map(|genome_id| {
            let samples = runs
                .iter()
                .filter(|run| run.genome_id == genome_id)
                .collect::<Vec<_>>();
            SelectionCandidate {
                genome_id,
                metrics: average_metrics(&samples),
            }
        })
        .collect::<Vec<_>>();
    Ok(artificial_select(&candidates, constraints))
}

fn average_metrics(samples: &[&ControlledBenchmarkRun]) -> CanonicalAgentMetrics {
    let average = |values: Vec<f64>| values.iter().sum::<f64>() / values.len() as f64;
    CanonicalAgentMetrics {
        accuracy: average(samples.iter().map(|run| run.metrics.accuracy).collect()),
        cost: average(samples.iter().map(|run| run.metrics.cost).collect()),
        tokens: average(samples.iter().map(|run| run.metrics.tokens).collect()),
        latency: average(samples.iter().map(|run| run.metrics.latency).collect()),
        tool_calls: average(samples.iter().map(|run| run.metrics.tool_calls).collect()),
        risk: average(samples.iter().map(|run| run.metrics.risk).collect()),
        hallucinations: average(
            samples
                .iter()
                .map(|run| run.metrics.hallucinations)
                .collect(),
        ),
        novelty: average(samples.iter().map(|run| run.metrics.novelty).collect()),
        success: average(samples.iter().map(|run| run.metrics.success).collect()),
    }
}

pub fn artificial_select(
    candidates: &[SelectionCandidate],
    constraints: &SelectionConstraints,
) -> ArtificialSelectionReport {
    let (eligible_candidates, rejected_candidates): (Vec<_>, Vec<_>) =
        candidates.iter().partition(|candidate| {
            candidate.metrics.cost <= constraints.max_cost
                && candidate.metrics.risk <= constraints.max_risk
                && candidate.metrics.hallucinations <= constraints.max_hallucinations
                && candidate.metrics.success >= constraints.min_success
        });
    let branches = eligible_candidates
        .iter()
        .map(|candidate| MultiObjectiveBranchScore {
            branch_id: genos_core::BranchId(candidate.genome_id.0.clone()),
            objectives: vec![
                ObjectiveScore {
                    objective: "accuracy".to_string(),
                    score: candidate.metrics.accuracy,
                },
                ObjectiveScore {
                    objective: "cost".to_string(),
                    score: candidate.metrics.cost,
                },
                ObjectiveScore {
                    objective: "tokens".to_string(),
                    score: candidate.metrics.tokens,
                },
                ObjectiveScore {
                    objective: "latency".to_string(),
                    score: candidate.metrics.latency,
                },
                ObjectiveScore {
                    objective: "tool_calls".to_string(),
                    score: candidate.metrics.tool_calls,
                },
                ObjectiveScore {
                    objective: "novelty".to_string(),
                    score: candidate.metrics.novelty,
                },
                ObjectiveScore {
                    objective: "success".to_string(),
                    score: candidate.metrics.success,
                },
            ],
        })
        .collect::<Vec<_>>();
    let directions = [
        ("accuracy", ObjectiveDirection::Maximize),
        ("cost", ObjectiveDirection::Minimize),
        ("tokens", ObjectiveDirection::Minimize),
        ("latency", ObjectiveDirection::Minimize),
        ("tool_calls", ObjectiveDirection::Minimize),
        ("novelty", ObjectiveDirection::Maximize),
        ("success", ObjectiveDirection::Maximize),
    ]
    .into_iter()
    .map(|(objective, direction)| ParetoObjective {
        objective: objective.to_string(),
        direction,
    })
    .collect::<Vec<_>>();
    ArtificialSelectionReport {
        eligible: eligible_candidates
            .iter()
            .map(|candidate| candidate.genome_id.clone())
            .collect(),
        rejected: rejected_candidates
            .iter()
            .map(|candidate| candidate.genome_id.clone())
            .collect(),
        pareto: pareto_select(&branches, &directions),
    }
}
