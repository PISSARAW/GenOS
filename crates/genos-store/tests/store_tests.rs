mod common;

use common::{make_event, make_snapshot, temp_store_path};
use genos_core::{AgentEventType, CapsuleRelation, SnapshotId};
use genos_store::{
    CapsuleStore, EventStore, LocalArtifactStore, LocalCapsuleStore, LocalEventStore,
    LocalSnapshotComponentStore, LocalSnapshotStore, SnapshotStore,
};
use sha2::{Digest, Sha256};
use tokio::fs;

#[tokio::test]
async fn identical_branch_artifacts_share_one_physical_blob() {
    let root = temp_store_path().with_extension("artifacts");
    let store = LocalArtifactStore::new(&root);
    let bytes = b"same generated file";

    let reference_a = store
        .put(bytes, "text/plain")
        .await
        .expect("store A failed");
    let reference_b = store
        .put(bytes, "text/plain")
        .await
        .expect("store B failed");

    assert_eq!(reference_a.digest, reference_b.digest);
    assert_eq!(reference_a.digest, format!("{:x}", Sha256::digest(bytes)));
    assert!(fs::try_exists(store.blob_path(&reference_a.digest))
        .await
        .expect("blob lookup failed"));
    let mut entries = fs::read_dir(root.join("sha256"))
        .await
        .expect("artifact directory missing");
    assert!(entries
        .next_entry()
        .await
        .expect("read entry failed")
        .is_some());
    assert!(entries
        .next_entry()
        .await
        .expect("read entry failed")
        .is_none());

    fs::remove_dir_all(&root)
        .await
        .expect("artifact cleanup failed");
}

#[tokio::test]
async fn similar_snapshots_share_identical_components() {
    let root = temp_store_path().with_extension("snapshot-components");
    let store = LocalSnapshotComponentStore::new(&root);
    let parent = make_snapshot(0);
    let s1 = genos_core::fork_snapshot(&parent);
    let s2 = genos_core::fork_snapshot(&parent);

    let manifest_1 = store.store_components(&s1).await.expect("store S1 failed");
    let manifest_2 = store.store_components(&s2).await.expect("store S2 failed");

    assert_ne!(manifest_1.snapshot_id, manifest_2.snapshot_id);
    assert_eq!(manifest_1.genome.digest, manifest_2.genome.digest);
    assert_eq!(
        manifest_1.working_memory.digest,
        manifest_2.working_memory.digest
    );
    assert_eq!(manifest_1.memories.digest, manifest_2.memories.digest);
    assert_eq!(
        manifest_1.runtime_metadata.digest,
        manifest_2.runtime_metadata.digest
    );
    assert!(
        fs::try_exists(store.component_path(&manifest_1.genome.digest))
            .await
            .expect("genome blob missing")
    );

    fs::remove_dir_all(&root)
        .await
        .expect("component cleanup failed");
}

#[tokio::test]
async fn local_store_is_append_only_and_ordered() {
    let path = temp_store_path();
    let store = LocalEventStore::new(&path);

    let e1 = make_event(AgentEventType::AgentCreated, 1, "branch-a");
    let e2 = make_event(AgentEventType::AgentStarted, 2, "branch-a");

    store.append(e1.clone()).await.expect("append e1 failed");
    store.append(e2.clone()).await.expect("append e2 failed");

    let all = store.stream(None).await.expect("stream failed");
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].event_id, e1.event_id);
    assert_eq!(all[1].event_id, e2.event_id);

    if fs::try_exists(&path).await.expect("try_exists failed") {
        fs::remove_file(path).await.expect("cleanup failed");
    }
}

#[tokio::test]
async fn stream_filters_by_branch() {
    let path = temp_store_path();
    let store = LocalEventStore::new(&path);

    store
        .append(make_event(AgentEventType::AgentCreated, 1, "branch-a"))
        .await
        .expect("append branch-a failed");
    store
        .append(make_event(AgentEventType::AgentCreated, 1, "branch-b"))
        .await
        .expect("append branch-b failed");

    let only_a = store
        .stream(Some("branch-a".to_string()))
        .await
        .expect("stream branch-a failed");
    assert_eq!(only_a.len(), 1);
    assert_eq!(
        only_a[0].branch_id.as_ref().expect("missing branch").0,
        "branch-a"
    );

    if fs::try_exists(&path).await.expect("try_exists failed") {
        fs::remove_file(path).await.expect("cleanup failed");
    }
}

#[tokio::test]
async fn local_snapshot_store_save_and_get() {
    let path = temp_store_path();
    let store = LocalSnapshotStore::new(&path);
    let snapshot = make_snapshot(3);
    let snapshot_id = snapshot.snapshot_id.0.clone();

    store
        .save_snapshot(snapshot)
        .await
        .expect("save snapshot failed");

    let loaded = store
        .get_snapshot(snapshot_id)
        .await
        .expect("get snapshot failed");

    assert!(loaded.is_some());
    assert_eq!(loaded.expect("snapshot missing").state.execution.step, 3);

    if fs::try_exists(&path).await.expect("try_exists failed") {
        fs::remove_file(path).await.expect("cleanup failed");
    }
}

#[tokio::test]
async fn local_snapshot_store_returns_none_when_missing() {
    let path = temp_store_path();
    let store = LocalSnapshotStore::new(&path);

    let loaded = store
        .get_snapshot("does-not-exist".to_string())
        .await
        .expect("get snapshot failed");

    assert!(loaded.is_none());
}

#[tokio::test]
async fn local_snapshot_store_lists_unique_ids() {
    let path = temp_store_path();
    let store = LocalSnapshotStore::new(&path);

    let snapshot1 = make_snapshot(1);
    let mut snapshot2 = make_snapshot(2);
    snapshot2.snapshot_id = snapshot1.snapshot_id.clone();
    let snapshot3 = make_snapshot(3);

    store
        .save_snapshot(snapshot1.clone())
        .await
        .expect("save snapshot1 failed");
    store
        .save_snapshot(snapshot2)
        .await
        .expect("save snapshot2 failed");
    store
        .save_snapshot(snapshot3.clone())
        .await
        .expect("save snapshot3 failed");

    let ids = store
        .list_snapshot_ids()
        .await
        .expect("list snapshot ids failed");

    assert_eq!(ids.len(), 2);
    assert_eq!(ids[0], snapshot1.snapshot_id.0);
    assert_eq!(ids[1], snapshot3.snapshot_id.0);

    if fs::try_exists(&path).await.expect("try_exists failed") {
        fs::remove_file(path).await.expect("cleanup failed");
    }
}

#[tokio::test]
async fn capsule_store_round_trips_verified_checkpoints() {
    let path = temp_store_path();
    let store = LocalCapsuleStore::new(&path);
    let snapshot = make_snapshot(0);
    let capsule = genos_core::AgentWorldCapsule::new(
        snapshot.clone(),
        SnapshotId::new(),
        Some(snapshot.world_id.clone()),
        vec![],
        None,
        CapsuleRelation::Genesis,
    );
    store.save_capsule(capsule.clone()).await.unwrap();
    let loaded = store
        .get_capsule(capsule.capsule_id.0.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(loaded, capsule);
    assert!(loaded.verify_integrity());
    assert_eq!(
        store
            .list_branch_capsules(snapshot.branch_id.0)
            .await
            .unwrap()
            .len(),
        1
    );
    if fs::try_exists(&path).await.unwrap() {
        fs::remove_file(path).await.unwrap();
    }
}
