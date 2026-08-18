use genos_core::BranchId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchEvolutionConfig {
    pub total_compute_units: u64,
    pub minimum_evaluation_units: u64,
    pub survival_threshold: f64,
    pub max_depth: usize,
    pub max_children_per_branch: usize,
    #[serde(default)]
    pub max_survivors_per_generation: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EvolutionBranchSpec {
    pub branch_id: BranchId,
    pub parent_branch_id: Option<BranchId>,
    pub score: f64,
    #[serde(default)]
    pub children: Vec<BranchId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvolutionBranchState {
    Eliminated,
    CapacityPruned,
    Expanded,
    Survived,
    BudgetExhausted,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EvolutionBranchRecord {
    pub branch_id: BranchId,
    pub parent_branch_id: Option<BranchId>,
    pub depth: usize,
    pub score: Option<f64>,
    pub evaluation_compute: u64,
    pub exploitation_compute: u64,
    pub state: EvolutionBranchState,
    pub children_spawned: Vec<BranchId>,
    pub reason: String,
}

impl EvolutionBranchRecord {
    pub fn total_compute(&self) -> u64 {
        self.evaluation_compute + self.exploitation_compute
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EvolutionGeneration {
    pub depth: usize,
    pub evaluated: Vec<BranchId>,
    pub eliminated: Vec<BranchId>,
    pub survivors: Vec<BranchId>,
    pub spawned: Vec<BranchId>,
    pub compute_used: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchEvolutionReport {
    pub config: BranchEvolutionConfig,
    pub branches: Vec<EvolutionBranchRecord>,
    pub generations: Vec<EvolutionGeneration>,
    pub living_leaves: Vec<BranchId>,
    pub dead_branches: Vec<BranchId>,
    pub not_spawned: Vec<BranchId>,
    pub compute_used: u64,
    pub compute_remaining: u64,
}

#[derive(Clone)]
pub(crate) struct ActiveBranch {
    pub id: BranchId,
    pub depth: usize,
    pub inherited_score: f64,
}

pub(crate) struct BranchRecordDetail {
    pub evaluation_compute: u64,
    pub state: EvolutionBranchState,
    pub children_spawned: Vec<BranchId>,
    pub reason: String,
}
