use genos_core::{BranchId, ExperimentId};
use serde::{Deserialize, Serialize};

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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectiveDirection {
    Maximize,
    Minimize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParetoObjective {
    pub objective: String,
    pub direction: ObjectiveDirection,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParetoStatus {
    NonDominated,
    Dominated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParetoAssessment {
    pub branch_id: BranchId,
    pub status: ParetoStatus,
}

/// Mark branches on the Pareto frontier. A branch dominates another only when
/// it is no worse on every objective and strictly better on at least one.
pub fn pareto_select(
    branches: &[MultiObjectiveBranchScore],
    objectives: &[ParetoObjective],
) -> Vec<ParetoAssessment> {
    branches
        .iter()
        .map(|candidate| ParetoAssessment {
            branch_id: candidate.branch_id.clone(),
            status: if branches.iter().any(|other| {
                other.branch_id != candidate.branch_id && dominates(other, candidate, objectives)
            }) {
                ParetoStatus::Dominated
            } else {
                ParetoStatus::NonDominated
            },
        })
        .collect()
}

fn dominates(
    left: &MultiObjectiveBranchScore,
    right: &MultiObjectiveBranchScore,
    objectives: &[ParetoObjective],
) -> bool {
    let mut strictly_better = false;
    for objective in objectives {
        let Some(left_score) = left
            .objectives
            .iter()
            .find(|score| score.objective == objective.objective)
        else {
            return false;
        };
        let Some(right_score) = right
            .objectives
            .iter()
            .find(|score| score.objective == objective.objective)
        else {
            return false;
        };
        let ordering = left_score.score.total_cmp(&right_score.score);
        let no_worse = match objective.direction {
            ObjectiveDirection::Maximize => ordering.is_ge(),
            ObjectiveDirection::Minimize => ordering.is_le(),
        };
        let better = match objective.direction {
            ObjectiveDirection::Maximize => ordering.is_gt(),
            ObjectiveDirection::Minimize => ordering.is_lt(),
        };
        if !no_worse {
            return false;
        }
        strictly_better |= better;
    }
    strictly_better
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
