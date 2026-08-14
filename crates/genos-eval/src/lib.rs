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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchSelection {
    pub active_branch: BranchId,
    /// All evaluated branches remain available for inspection; selection does
    /// not merge or delete the non-winning branches.
    pub inspectable_branches: Vec<BranchScore>,
}

pub fn select_winner(result: &EvaluationResult) -> Option<BranchSelection> {
    result.winner.clone().map(|active_branch| BranchSelection {
        active_branch,
        inspectable_branches: result.ranking.clone(),
    })
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

    #[test]
    fn selecting_b_changes_active_branch_without_merging_or_deleting_siblings() {
        let result = EvaluationResult {
            experiment_id: ExperimentId("winner-takes-branch-v0".to_string()),
            ranking: vec![
                BranchScore { branch_id: BranchId("B".to_string()), score: 0.9 },
                BranchScore { branch_id: BranchId("C".to_string()), score: 0.7 },
                BranchScore { branch_id: BranchId("A".to_string()), score: 0.4 },
            ],
            winner: Some(BranchId("B".to_string())),
        };
        let selection = select_winner(&result).expect("winner must be selectable");
        assert_eq!(selection.active_branch, BranchId("B".to_string()));
        assert_eq!(selection.inspectable_branches.len(), 3);
        assert!(selection
            .inspectable_branches
            .iter()
            .any(|branch| branch.branch_id == BranchId("A".to_string())));
        assert!(selection
            .inspectable_branches
            .iter()
            .any(|branch| branch.branch_id == BranchId("C".to_string())));
    }
}
