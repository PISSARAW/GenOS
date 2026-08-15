use genos_core::{
    fork_snapshot_with_hypothesis, AgentWorldCapsule, CapsuleLifecycle, CapsuleRelation,
    RestorableComponent,
};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;

#[derive(Clone, Debug)]
pub struct CounterfactualBranchSpec {
    pub label: String,
    pub hypothesis: String,
}

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
        let world_id = provider.fork(parent.world_snapshot_id.clone()).await?;
        let mut agent =
            fork_snapshot_with_hypothesis(&parent.agent_snapshot, &spec.label, &spec.hypothesis);
        agent.world_id = world_id.clone();
        agent.state.world_id = world_id.clone();
        let world_snapshot = match provider.snapshot(world_id.clone()).await {
            Ok(snapshot) => snapshot,
            Err(error) => {
                let _ = provider.destroy(world_id).await;
                return Err(error);
            }
        };
        let mut capsule = AgentWorldCapsule::new(
            agent,
            world_snapshot,
            Some(world_id.clone()),
            parent.components.clone(),
            Some(parent.capsule_id.clone()),
            CapsuleRelation::Fork,
        );
        capsule
            .transition(CapsuleLifecycle::Running)
            .map_err(anyhow::Error::msg)?;
        if let Err(error) = store.save_capsule(capsule.clone()).await {
            let _ = provider.destroy(world_id).await;
            return Err(error);
        }
        capsules.push(capsule);
    }
    Ok(capsules)
}

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

pub fn default_capsule_components() -> Vec<RestorableComponent> {
    use genos_core::RestorationMode;
    vec![
        RestorableComponent {
            name: "filesystem".to_string(),
            mode: RestorationMode::Snapshot,
            digest: None,
            manifest: None,
            nondeterminism: vec![],
        },
        RestorableComponent {
            name: "processes".to_string(),
            mode: RestorationMode::Reconstruct,
            digest: None,
            manifest: Some("process-manifest.json".to_string()),
            nondeterminism: vec![],
        },
        RestorableComponent {
            name: "external_services".to_string(),
            mode: RestorationMode::External,
            digest: None,
            manifest: None,
            nondeterminism: vec!["service_state".to_string()],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{AgentWorldCapsule, CapsuleRelation};
    use genos_store::{CapsuleStore, LocalCapsuleStore};
    use genos_world::{DirectoryWorldProvider, WorldProvider};
    use tempfile::tempdir;

    #[tokio::test]
    async fn forks_bind_distinct_agents_worlds_streams_and_budgets() {
        let temp = tempdir().unwrap();
        let provider = DirectoryWorldProvider::new(temp.path().join("worlds"), None).unwrap();
        let store = LocalCapsuleStore::new(temp.path().join("capsules.jsonl"));
        let snapshot = crate::test_support::snapshot();
        let world_id = provider
            .create(snapshot.agent_id.clone(), snapshot.branch_id.clone())
            .await
            .unwrap();
        let world_snapshot = provider.snapshot(world_id.clone()).await.unwrap();
        let parent = AgentWorldCapsule::new(
            snapshot,
            world_snapshot,
            Some(world_id),
            default_capsule_components(),
            None,
            CapsuleRelation::Genesis,
        );
        store.save_capsule(parent.clone()).await.unwrap();
        let forks = fork_counterfactual_capsules(
            &provider,
            &store,
            &parent,
            &[
                CounterfactualBranchSpec {
                    label: "postgres".to_string(),
                    hypothesis: "keep".to_string(),
                },
                CounterfactualBranchSpec {
                    label: "new-db".to_string(),
                    hypothesis: "migrate".to_string(),
                },
            ],
        )
        .await
        .unwrap();
        assert_ne!(forks[0].branch_id, forks[1].branch_id);
        assert_ne!(forks[0].live_world_id, forks[1].live_world_id);
        assert_ne!(forks[0].event_stream_id, forks[1].event_stream_id);
        assert_eq!(forks[0].budget, forks[1].budget);
        assert!(forks.iter().all(AgentWorldCapsule::verify_integrity));
    }

    #[tokio::test]
    async fn pause_checkpoints_destroys_and_resume_reconstructs_world() {
        let temp = tempdir().unwrap();
        let provider = DirectoryWorldProvider::new(temp.path().join("worlds"), None).unwrap();
        let store = LocalCapsuleStore::new(temp.path().join("capsules.jsonl"));
        let snapshot = crate::test_support::snapshot();
        let world_id = provider
            .create(snapshot.agent_id.clone(), snapshot.branch_id.clone())
            .await
            .unwrap();
        let world_snapshot = provider.snapshot(world_id.clone()).await.unwrap();
        let mut capsule = AgentWorldCapsule::new(
            snapshot,
            world_snapshot,
            Some(world_id),
            default_capsule_components(),
            None,
            CapsuleRelation::Genesis,
        );
        capsule.transition(CapsuleLifecycle::Running).unwrap();
        let paused = pause_capsule(&provider, &store, &capsule).await.unwrap();
        assert_eq!(paused.lifecycle, CapsuleLifecycle::Paused);
        assert!(paused.live_world_id.is_none());
        let resumed = resume_capsule(&provider, &store, &paused).await.unwrap();
        assert_eq!(resumed.lifecycle, CapsuleLifecycle::Running);
        assert!(resumed.live_world_id.is_some());
    }
}
