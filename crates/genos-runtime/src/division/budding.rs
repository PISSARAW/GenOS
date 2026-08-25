use genos_core::{fork_snapshot_with_hypothesis, AgentWorldCapsule};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;
use serde::Serialize;

use super::DivisionReport;
use crate::capsules::default_capsule_components;

/// Default maximum number of buds one parent capsule may produce
/// (Hayflick limit): delegation must stay bounded.
pub const DEFAULT_HAYFLICK_LIMIT: u32 = 8;

#[derive(Clone, Debug)]
pub struct BudSpec {
    /// Short name of the delegated sub-task; stored as `bud:<label>`.
    pub label: String,
    pub hypothesis: String,
    /// Step budget granted to the bud; the parent keeps its own budget intact.
    pub bud_steps: u64,
}

/// One asymmetric division result plus the updated scar registry count.
#[derive(Clone, Debug, Serialize)]
pub struct BudOutcome {
    pub bud: AgentWorldCapsule,
    /// Total buds this parent has produced after this call (its "scars").
    pub scar_count: u32,
}

/// Spawn ONE specialized sub-agent from a parent capsule (bourgeonnement).
///
/// Asymmetric by construction: the parent capsule is returned untouched (same
/// state, same remaining budget) while the bud receives a small dedicated
/// allocation. Each successful bud leaves a scar — a persisted child capsule
/// labelled `bud:<label>` — and the Hayflick limit refuses divisions beyond
/// `hayflick_limit` scars on the same parent, preventing runaway spawn cascades.
///
/// Priority use case: bounded delegation — hand a narrow sub-task to a short-
/// lived specialist without letting the parent multiply uncontrolled.
#[allow(clippy::too_many_arguments)]
pub async fn bud_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    spec: &BudSpec,
    hayflick_limit: u32,
) -> anyhow::Result<BudOutcome> {
    if spec.label.trim().is_empty() {
        anyhow::bail!("bud label must not be empty");
    }
    if spec.bud_steps == 0 {
        anyhow::bail!("a bud needs at least one execution step");
    }
    let scar_count = count_bud_scars(store, &parent.capsule_id.0).await?;
    if scar_count >= hayflick_limit {
        anyhow::bail!(
            "Hayflick limit reached: capsule {} already has {scar_count} bud(s); \
             refusing to bud beyond {hayflick_limit}",
            parent.capsule_id.0
        );
    }

    let world_id = provider.fork(parent.world_snapshot_id.clone()).await?;
    let mut agent = fork_snapshot_with_hypothesis(
        &parent.agent_snapshot,
        format!("bud:{}", spec.label),
        spec.hypothesis.clone(),
    );
    agent.runtime_metadata.budget_steps_remaining = spec.bud_steps;
    agent.world_id = world_id.clone();
    agent.state.world_id = world_id.clone();

    let world_snapshot = match provider.snapshot(world_id.clone()).await {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let _ = provider.destroy(world_id).await;
            return Err(error);
        }
    };
    let mut bud = AgentWorldCapsule::new(
        agent,
        world_snapshot,
        Some(world_id.clone()),
        default_capsule_components(),
        Some(parent.capsule_id.clone()),
        genos_core::CapsuleRelation::Fork,
    );
    if let Err(error) = bud.transition(genos_core::CapsuleLifecycle::Running) {
        let _ = provider.destroy(world_id).await;
        return Err(anyhow::Error::msg(error));
    }
    if let Err(error) = store.save_capsule(bud.clone()).await {
        let _ = provider.destroy(world_id).await;
        return Err(error);
    }

    Ok(BudOutcome {
        scar_count: scar_count + 1,
        bud,
    })
}

/// Count persisted buds of one parent capsule: children with relation `Fork`,
/// the right parent, and a `bud:` label prefix. Integrity of every scanned
/// capsule is already verified by the store.
async fn count_bud_scars(
    store: &dyn CapsuleStore,
    parent_capsule_id: &str,
) -> anyhow::Result<u32> {
    let scars = store
        .list_all_capsules()
        .await?
        .into_iter()
        .filter(|capsule| {
            capsule.relation == genos_core::CapsuleRelation::Fork
                && capsule.parent_capsule.as_ref().map(|id| id.0.as_str())
                    == Some(parent_capsule_id)
                && capsule
                    .agent_snapshot
                    .branch_metadata
                    .label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("bud:"))
        })
        .count();
    u32::try_from(scars).map_err(|_| anyhow::anyhow!("bud scar count overflow"))
}

impl BudOutcome {
    pub fn report(&self, parent_capsule_id: &str) -> DivisionReport {
        DivisionReport {
            mode: "budding",
            parent_capsule_id: parent_capsule_id.to_string(),
            daughter_capsule_ids: vec![self.bud.capsule_id.0.clone()],
            steps_per_daughter: self.bud.budget.steps_remaining,
        }
    }
}
