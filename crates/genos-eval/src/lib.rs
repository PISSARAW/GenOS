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

/// Scores independently measured for one branch. No scalarisation or winner
/// selection is implied: callers retain the full trade-off surface.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MultiObjectiveBranchScore {
    pub branch_id: BranchId,
    pub objectives: Vec<ObjectiveScore>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveScore {
    pub objective: String,
    pub score: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MultiObjectiveEvaluation {
    pub experiment_id: ExperimentId,
    pub branches: Vec<MultiObjectiveBranchScore>,
}

pub fn record_multi_objective_evaluation(
    experiment_id: ExperimentId,
    branches: impl IntoIterator<Item = MultiObjectiveBranchScore>,
) -> MultiObjectiveEvaluation {
    MultiObjectiveEvaluation {
        experiment_id,
        branches: branches.into_iter().collect(),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchSelection {
    pub active_branch: BranchId,
    /// All evaluated branches remain available for inspection; selection does
    /// not merge or delete the non-winning branches.
    pub inspectable_branches: Vec<BranchScore>,
}

impl BranchSelection {
    /// Resume any retained branch, including a branch that previously lost.
    /// No branch is deleted or merged as a side effect.
    pub fn resume(&mut self, branch_id: &BranchId) -> Option<BranchId> {
        if self
            .inspectable_branches
            .iter()
            .any(|branch| &branch.branch_id == branch_id)
        {
            self.active_branch = branch_id.clone();
            Some(self.active_branch.clone())
        } else {
            None
        }
    }
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

    #[test]
    fn a_losing_branch_can_be_resumed_later() {
        let result = evaluate_answers(
            ExperimentId("exploration-retroactive".to_string()),
            [
                CounterfactualAnswer { branch_id: BranchId("A".to_string()), answer: 4 },
                CounterfactualAnswer { branch_id: BranchId("B".to_string()), answer: 8 },
                CounterfactualAnswer { branch_id: BranchId("C".to_string()), answer: 6 },
            ],
        );
        let mut selection = select_winner(&result).expect("winner must be selectable");
        assert_eq!(selection.active_branch, BranchId("B".to_string()));
        assert_eq!(
            selection.resume(&BranchId("C".to_string())),
            Some(BranchId("C".to_string()))
        );
        assert_eq!(selection.active_branch, BranchId("C".to_string()));
        assert_eq!(selection.inspectable_branches.len(), 3);
    }

    #[test]
    fn multi_objective_evaluation_retains_tradeoffs_without_selecting_a_winner() {
        let evaluation = record_multi_objective_evaluation(
            ExperimentId("pareto-preparation".to_string()),
            [
                MultiObjectiveBranchScore {
                    branch_id: BranchId("A".to_string()),
                    objectives: vec![
                        ObjectiveScore { objective: "correctness".to_string(), score: 0.9 },
                        ObjectiveScore { objective: "speed".to_string(), score: 0.6 },
                        ObjectiveScore { objective: "cost".to_string(), score: 0.8 },
                    ],
                },
                MultiObjectiveBranchScore {
                    branch_id: BranchId("B".to_string()),
                    objectives: vec![
                        ObjectiveScore { objective: "correctness".to_string(), score: 0.8 },
                        ObjectiveScore { objective: "speed".to_string(), score: 0.95 },
                        ObjectiveScore { objective: "cost".to_string(), score: 0.5 },
                    ],
                },
            ],
        );

        assert_eq!(evaluation.branches.len(), 2);
        assert_eq!(evaluation.branches[0].objectives.len(), 3);
        assert_eq!(evaluation.branches[1].objectives[1].score, 0.95);
    }
}
