use super::*;
use tempfile::tempdir;

#[test]
fn selected_checkpoint_head_restores_older_state() {
    let dir = tempdir().unwrap();
    let store = CheckpointStore::new(dir.path()).unwrap();
    store.save(&OrchestrationCheckpoint::new(1, serde_json::json!({ "state": "first" }))).unwrap();
    let older = crate::checkpoint_head::read(dir.path()).unwrap().unwrap();
    store.save(&OrchestrationCheckpoint::new(2, serde_json::json!({ "state": "second" }))).unwrap();
    fs::write(dir.path().join("orchestration.head.json"),
        serde_json::json!({ "name": older, "rewound": true }).to_string()).unwrap();
    assert_eq!(store.load().unwrap().unwrap().seq_id, 1);
    store.save(&OrchestrationCheckpoint::new(3, serde_json::json!({ "state": "third" }))).unwrap();
    assert!(store.is_rewound().unwrap());
    assert_eq!(store.load().unwrap().unwrap().seq_id, 3);
}
