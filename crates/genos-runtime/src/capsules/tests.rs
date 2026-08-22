use super::*;
use async_trait::async_trait;
use genos_core::{AgentWorldCapsule, CapsuleLifecycle, CapsuleRelation, RestorableComponent};
use genos_store::{CapsuleStore, LocalCapsuleStore};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use tempfile::tempdir;

struct ManifestRestorer;

#[async_trait]
impl ComponentRestorer for ManifestRestorer {
    async fn reconstruct(&self, _component: &RestorableComponent) -> anyhow::Result<()> {
        Ok(())
    }
}

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
    let reports = restore_capsule_components(&resumed, &ManifestRestorer)
        .await
        .unwrap();
    assert!(reports
        .iter()
        .any(|report| report.status == ComponentRestoreStatus::Reconstructed));
    assert!(reports
        .iter()
        .any(|report| report.status == ComponentRestoreStatus::ExternalUncontrolled));
}

#[tokio::test]
async fn eliminated_capsule_is_checkpointed_cancelled_and_its_world_destroyed() {
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
        Some(world_id.clone()),
        default_capsule_components(),
        None,
        CapsuleRelation::Genesis,
    );
    capsule.transition(CapsuleLifecycle::Running).unwrap();
    let terminated = terminate_capsule(&provider, &store, &capsule, CapsuleLifecycle::Cancelled)
        .await
        .unwrap();
    assert_eq!(terminated.lifecycle, CapsuleLifecycle::Cancelled);
    assert!(terminated.live_world_id.is_none());
    assert!(terminated.verify_integrity());
    assert!(provider.snapshot(world_id).await.is_err());
}
