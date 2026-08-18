use crate::pareto::ObjectiveScore;
use genos_core::BranchId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HypothesisOutcome {
    Supported,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReusableDiscovery {
    pub branch_id: BranchId,
    pub finding: String,
    pub evidence: String,
    pub reusable: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RefactorBranchEvaluation {
    pub branch_id: BranchId,
    pub hypothesis: String,
    pub outcome: HypothesisOutcome,
    pub outcome_reason: String,
    pub metrics: Vec<ObjectiveScore>,
    pub discoveries: Vec<ReusableDiscovery>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveWeight {
    pub objective: String,
    pub weight: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveMergeResult {
    pub selected_branch: BranchId,
    pub selected_score: f64,
    pub rejected_hypotheses: Vec<String>,
    pub reused_discoveries: Vec<ReusableDiscovery>,
    pub explanation: String,
}

/// Select a branch with an explicit weighted policy, while retaining reusable
/// findings from every lineage. This merges knowledge, never workspace state.
pub fn synthesize_refactor_experiment(
    evaluations: &[RefactorBranchEvaluation],
    weights: &[ObjectiveWeight],
) -> Option<CognitiveMergeResult> {
    let weighted_score = |evaluation: &RefactorBranchEvaluation| {
        weights
            .iter()
            .map(|weight| {
                evaluation
                    .metrics
                    .iter()
                    .find(|metric| metric.objective == weight.objective)
                    .map_or(0.0, |metric| metric.score * weight.weight)
            })
            .sum::<f64>()
    };
    let (winner, score) = evaluations
        .iter()
        .map(|evaluation| (evaluation, weighted_score(evaluation)))
        .max_by(|(left_eval, left_score), (right_eval, right_score)| {
            left_score
                .total_cmp(right_score)
                .then_with(|| right_eval.branch_id.0.cmp(&left_eval.branch_id.0))
        })?;
    let rejected_hypotheses = evaluations
        .iter()
        .filter(|evaluation| evaluation.outcome == HypothesisOutcome::Rejected)
        .map(|evaluation| format!("{}: {}", evaluation.hypothesis, evaluation.outcome_reason))
        .collect::<Vec<_>>();
    let reused_discoveries = evaluations
        .iter()
        .flat_map(|evaluation| evaluation.discoveries.iter())
        .filter(|discovery| discovery.reusable)
        .cloned()
        .collect::<Vec<_>>();
    Some(CognitiveMergeResult {
        selected_branch: winner.branch_id.clone(),
        selected_score: score,
        rejected_hypotheses,
        explanation: format!(
            "selected {} with weighted score {:.3}; retained {} reusable discoveries",
            winner.branch_id,
            score,
            reused_discoveries.len()
        ),
        reused_discoveries,
    })
}
