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
