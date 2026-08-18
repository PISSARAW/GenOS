mod allocation;
mod scheduler;
mod types;
mod validation;

#[cfg(test)]
mod tests;

pub use scheduler::run_branch_evolution;
pub use types::{
    BranchEvolutionConfig, BranchEvolutionReport, EvolutionBranchRecord, EvolutionBranchSpec,
    EvolutionBranchState, EvolutionGeneration,
};
