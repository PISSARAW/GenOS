use genos_core::BranchId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LiveScore {
    pub branch_id: BranchId,
    pub score: f64,
}

pub struct LiveEvaluator {
    pub budget: f64,
}

impl LiveEvaluator {
    pub fn new(budget: f64) -> Self {
        Self { budget }
    }

    pub fn evaluate_branch(&self, branch_id: &BranchId, metrics: &[f64]) -> LiveScore {
        let sum: f64 = metrics.iter().sum();
        let score = if metrics.is_empty() { 0.0 } else { sum / metrics.len() as f64 };
        LiveScore {
            branch_id: branch_id.clone(),
            score,
        }
    }
}
