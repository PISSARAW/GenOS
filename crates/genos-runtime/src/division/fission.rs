use genos_core::{fork_snapshot, AgentWorldCapsule, BranchMetadata};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;
use serde::Serialize;

use super::{build_daughter_capsule, even_split, rollback, DivisionReport};

/// Elastic scale-out of lightweight workers (binary fission).
///
/// Prokaryote profile: daughters carry no hypothesis metadata and split the
/// parent's remaining step budget evenly, so a wide fan-out stays affordable.
#[derive(Clone, Debug, Serialize)]
pub struct FissionOutcome {
    pub daughters: Vec<AgentWorldCapsule>,
    pub steps_per_daughter: u64,
}

/// Divide one parent capsule into `count` symmetric lightweight daughters
/// (scissiparité).
///
/// Priority use case: elastic scale-out of independent subtasks (map-reduce
/// sweeps, batched verification) where each worker needs isolation and a slice
/// of the budget but no experimental hypothesis attached.
///
/// Budget semantics: the parent's remaining steps are divided evenly between
/// daughters (`floor`); the division is refused when the budget cannot fund at
/// least one step per daughter. On any failure everything already created is
/// torn down.
#[allow(clippy::too_many_arguments)]
pub async fn binary_fission_capsules(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    count: u32,
) -> anyhow::Result<FissionOutcome> {
    let steps_per_daughter = even_split(parent.budget.steps_remaining, count)?;

    let mut capsules = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let world_id = match provider.fork(parent.world_snapshot_id.clone()).await {
            Ok(id) => id,
            Err(error) => {
                rollback(provider, store, &capsules).await;
                return Err(error);
            }
        };
        let mut agent = fork_snapshot(&parent.agent_snapshot);
        // Prokaryote payload: no branch metadata, budget split evenly.
        agent.branch_metadata = BranchMetadata::default();
        agent.runtime_metadata.budget_steps_remaining = steps_per_daughter;
        agent.world_id = world_id.clone();
        agent.state.world_id = world_id.clone();

        match build_daughter_capsule(provider, store, parent, agent, world_id).await {
            Ok(capsule) => capsules.push(capsule),
            Err(error) => {
                rollback(provider, store, &capsules).await;
                return Err(error);
            }
        }
    }

    Ok(FissionOutcome {
        steps_per_daughter,
        daughters: capsules,
    })
}

impl FissionOutcome {
    pub fn report(&self, parent_capsule_id: &str) -> DivisionReport {
        DivisionReport {
            mode: "binary_fission",
            parent_capsule_id: parent_capsule_id.to_string(),
            daughter_capsule_ids: self
                .daughters
                .iter()
                .map(|capsule| capsule.capsule_id.0.clone())
                .collect(),
            steps_per_daughter: self.steps_per_daughter,
        }
    }
}
