mod components;
mod forking;
mod lifecycle;
mod types;

#[cfg(test)]
mod tests;

pub use components::{default_capsule_components, restore_capsule_components};
pub use forking::{fork_counterfactual_capsules, fork_lineaged_counterfactual_capsules};
pub use lifecycle::{
    checkpoint_capsule, pause_capsule, resume_capsule, terminate_capsule,
    terminate_evolution_branches,
};
pub use types::{
    ComponentRestoreReport, ComponentRestoreStatus, ComponentRestorer, CounterfactualBranchSpec,
    LineagedCounterfactualBranchSpec,
};
