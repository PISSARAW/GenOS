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
}
