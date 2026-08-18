use genos_core::{AgentWorldCapsule, CapsuleLifecycle};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;

use crate::{BranchEvolutionReport, EvolutionBranchState};

pub async fn checkpoint_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsule: &AgentWorldCapsule,
) -> anyhow::Result<AgentWorldCapsule> {
    let world_id = capsule
        .live_world_id
        .clone()
        .ok_or_else(|| anyhow::anyhow!("capsule has no live world"))?;
    let world_snapshot = provider.snapshot(world_id).await?;
    let checkpoint = capsule.checkpoint(world_snapshot);
    store.save_capsule(checkpoint.clone()).await?;
    Ok(checkpoint)
}

pub async fn pause_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsule: &AgentWorldCapsule,
) -> anyhow::Result<AgentWorldCapsule> {
    let mut paused = checkpoint_capsule(provider, store, capsule).await?;
    let world_id = paused
        .live_world_id
        .take()
        .ok_or_else(|| anyhow::anyhow!("capsule has no live world"))?;
    paused
        .transition(CapsuleLifecycle::Paused)
        .map_err(anyhow::Error::msg)?;
    provider.destroy(world_id).await?;
    store.save_capsule(paused.clone()).await?;
    Ok(paused)
}

/// Checkpoint and physically stop a branch world selected for death by the
/// evolution scheduler. The capsule remains durable and auditable.
pub async fn terminate_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsule: &AgentWorldCapsule,
    lifecycle: CapsuleLifecycle,
) -> anyhow::Result<AgentWorldCapsule> {
    if !matches!(
        lifecycle,
        CapsuleLifecycle::Cancelled | CapsuleLifecycle::BudgetExhausted
    ) {
        anyhow::bail!("branch termination requires cancelled or budget_exhausted lifecycle");
    }
    let mut terminated = checkpoint_capsule(provider, store, capsule).await?;
    let world_id = terminated
        .live_world_id
        .take()
        .ok_or_else(|| anyhow::anyhow!("capsule has no live world"))?;
    provider.destroy(world_id).await?;
    terminated
        .transition(lifecycle)
        .map_err(anyhow::Error::msg)?;
    store.save_capsule(terminated.clone()).await?;
    Ok(terminated)
}

pub async fn terminate_evolution_branches(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsules: &[AgentWorldCapsule],
    report: &BranchEvolutionReport,
) -> anyhow::Result<Vec<AgentWorldCapsule>> {
    let mut terminated = Vec::new();
    for record in &report.branches {
        let lifecycle = match record.state {
            EvolutionBranchState::Eliminated | EvolutionBranchState::CapacityPruned => {
                CapsuleLifecycle::Cancelled
            }
            EvolutionBranchState::BudgetExhausted => CapsuleLifecycle::BudgetExhausted,
            EvolutionBranchState::Expanded | EvolutionBranchState::Survived => continue,
        };
        let capsule = capsules
            .iter()
            .find(|capsule| capsule.branch_id == record.branch_id)
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "missing live capsule for dead branch {}",
                    record.branch_id.0
                )
            })?;
        terminated.push(terminate_capsule(provider, store, capsule, lifecycle).await?);
    }
    Ok(terminated)
}

pub async fn resume_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsule: &AgentWorldCapsule,
) -> anyhow::Result<AgentWorldCapsule> {
    if capsule.lifecycle != CapsuleLifecycle::Paused {
        anyhow::bail!("only paused capsules can be resumed");
    }
    let world_id = provider.fork(capsule.world_snapshot_id.clone()).await?;
    let mut resumed = capsule.clone();
    resumed.live_world_id = Some(world_id.clone());
    resumed.agent_snapshot.world_id = world_id.clone();
    resumed.agent_snapshot.state.world_id = world_id;
    resumed
        .transition(CapsuleLifecycle::Running)
        .map_err(anyhow::Error::msg)?;
    store.save_capsule(resumed.clone()).await?;
    Ok(resumed)
}
