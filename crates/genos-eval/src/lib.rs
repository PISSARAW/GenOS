use genos_core::{BranchId, ExperimentId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchScore {
    pub branch_id: BranchId,
    pub score: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvaluationResult {
    pub experiment_id: ExperimentId,
    pub ranking: Vec<BranchScore>,
    pub winner: Option<BranchId>,
}

/// Deterministic result used by the first counterfactual experiment: the
/// evaluator's score is simply the branch answer.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CounterfactualAnswer {
    pub branch_id: BranchId,
    pub answer: i64,
}

pub fn evaluate_answers(
    experiment_id: ExperimentId,
    answers: impl IntoIterator<Item = CounterfactualAnswer>,
) -> EvaluationResult {
    let mut ranking: Vec<_> = answers
        .into_iter()
        .map(|answer| BranchScore {
            branch_id: answer.branch_id,
            score: answer.answer as f64,
        })
        .collect();
    ranking.sort_by(|a, b| b.score.total_cmp(&a.score));
    let winner = ranking.first().map(|entry| entry.branch_id.clone());
    EvaluationResult {
        experiment_id,
        ranking,
        winner,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_branch_b_for_the_trivial_counterfactual_experiment() {
        let result = evaluate_answers(
            ExperimentId("largest-value".to_string()),
            [
                CounterfactualAnswer { branch_id: BranchId("A".to_string()), answer: 4 },
                CounterfactualAnswer { branch_id: BranchId("B".to_string()), answer: 8 },
                CounterfactualAnswer { branch_id: BranchId("C".to_string()), answer: 6 },
            ],
        );
        assert_eq!(result.winner, Some(BranchId("B".to_string())));
        assert_eq!(result.ranking[0].score, 8.0);
    }
}
