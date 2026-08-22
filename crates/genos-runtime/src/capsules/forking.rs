use genos_core::{
    fork_snapshot_with_hypothesis, AgentSnapshot, AgentWorldCapsule, CapsuleLifecycle,
    CapsuleRelation, WorldId,
};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;

use super::lifecycle::terminate_capsule;
use super::types::{CounterfactualBranchSpec, LineagedCounterfactualBranchSpec};

/// Atomically binds an agent clone and an isolated world into each durable
/// branch capsule. If persistence fails, the newly forked world is destroyed.
pub async fn fork_counterfactual_capsules(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    specs: &[CounterfactualBranchSpec],
) -> anyhow::Result<Vec<AgentWorldCapsule>> {
    if specs.is_empty() {
        anyhow::bail!("at least one counterfactual branch is required");
    }
    let mut capsules = Vec::with_capacity(specs.len());
    for spec in specs {
        let world_id = match provider.fork(parent.world_snapshot_id.clone()).await {
            Ok(id) => id,
            Err(error) => {
                cancel_created_capsules(provider, store, &capsules).await;
                return Err(error);
            }
        };
        let mut agent =
            fork_snapshot_with_hypothesis(&parent.agent_snapshot, &spec.label, &spec.hypothesis);
        agent.world_id = world_id.clone();
        agent.state.world_id = world_id.clone();

        match build_and_save_capsule(provider, store, parent, agent, world_id).await {
            Ok(capsule) => capsules.push(capsule),
            Err(error) => {
                cancel_created_capsules(provider, store, &capsules).await;
                return Err(error);
            }
        }
    }
    Ok(capsules)
}

/// Fork capsules using caller-assigned lineage branch identifiers.
pub async fn fork_lineaged_counterfactual_capsules(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    specs: &[LineagedCounterfactualBranchSpec],
) -> anyhow::Result<Vec<AgentWorldCapsule>> {
    if specs.is_empty() {
        anyhow::bail!("at least one counterfactual branch is required");
    }
    validate_unique_branch_ids(specs)?;

    let mut capsules = Vec::with_capacity(specs.len());
    for spec in specs {
        let world_id = match provider.fork(parent.world_snapshot_id.clone()).await {
            Ok(id) => id,
            Err(error) => {
                cancel_created_capsules(provider, store, &capsules).await;
                return Err(error);
            }
        };
        let mut agent =
            fork_snapshot_with_hypothesis(&parent.agent_snapshot, &spec.label, &spec.hypothesis);
        agent.branch_id = spec.branch_id.clone();
        agent.state.event_cursor.branch_id = spec.branch_id.clone();
        agent.state.event_cursor.last_event_id = None;
        agent.world_id = world_id.clone();
        agent.state.world_id = world_id.clone();

        match build_and_save_capsule(provider, store, parent, agent, world_id).await {
            Ok(capsule) => capsules.push(capsule),
            Err(error) => {
                cancel_created_capsules(provider, store, &capsules).await;
                return Err(error);
            }
        }
    }
    Ok(capsules)
}

fn validate_unique_branch_ids(specs: &[LineagedCounterfactualBranchSpec]) -> anyhow::Result<()> {
    let mut seen = std::collections::HashSet::new();
    if specs
        .iter()
        .any(|spec| !seen.insert(spec.branch_id.0.clone()))
    {
        anyhow::bail!("lineaged branch ids must be unique");
    }
    Ok(())
}

struct CapsuleCreationContext<'a> {
    provider: &'a dyn WorldProvider,
    store: &'a dyn CapsuleStore,
    parent: &'a AgentWorldCapsule,
}

async fn build_and_save_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    agent: AgentSnapshot,
    world_id: WorldId,
) -> anyhow::Result<AgentWorldCapsule> {
    let ctx = CapsuleCreationContext {
        provider,
        store,
        parent,
    };
    build_and_save_capsule_with_ctx(ctx, agent, world_id).await
}

async fn build_and_save_capsule_with_ctx(
    ctx: CapsuleCreationContext<'_>,
    agent: AgentSnapshot,
    world_id: WorldId,
) -> anyhow::Result<AgentWorldCapsule> {
    let world_snapshot = match ctx.provider.snapshot(world_id.clone()).await {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let _ = ctx.provider.destroy(world_id).await;
            return Err(error);
        }
    };
    let mut capsule = AgentWorldCapsule::new(
        agent,
        world_snapshot,
        Some(world_id.clone()),
        ctx.parent.components.clone(),
        Some(ctx.parent.capsule_id.clone()),
        CapsuleRelation::Fork,
    );
    if let Err(error) = capsule.transition(CapsuleLifecycle::Running) {
        let _ = ctx.provider.destroy(world_id).await;
        return Err(anyhow::Error::msg(error));
    }
    if let Err(error) = ctx.store.save_capsule(capsule.clone()).await {
        let _ = ctx.provider.destroy(world_id).await;
        return Err(error);
    }
    Ok(capsule)
}

async fn cancel_created_capsules(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsules: &[AgentWorldCapsule],
) {
    for capsule in capsules {
        let _ = terminate_capsule(provider, store, capsule, CapsuleLifecycle::Cancelled).await;
    }
}
