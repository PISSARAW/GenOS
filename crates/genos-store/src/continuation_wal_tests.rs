    use super::*;
    use tempfile::tempdir;

    #[test]
    fn wal_append_and_read() {
        let dir = tempdir().unwrap();
        let mut wal = ContinuationWal::new(dir.path()).unwrap();

        let seq1 = wal.append(ContinuationAppend {
            entry_type: ContinuationType::Barrier,
            payload: serde_json::json!({ "barrier_id": "b1", "state": "pending" }),
            dependencies: vec![],
        }).unwrap();

        let seq2 = wal.append(ContinuationAppend {
            entry_type: ContinuationType::Promise,
            payload: serde_json::json!({ "promise_id": "p1", "status": "pending" }),
            dependencies: vec![seq1],
        }).unwrap();

        assert_eq!(seq1, 1);
        assert_eq!(seq2, 2);

        let entry1 = wal.get(seq1).unwrap();
        assert_eq!(entry1.entry_type, ContinuationType::Barrier);
        assert!(entry1.verify());

        let entry2 = wal.get(seq2).unwrap();
        assert_eq!(entry2.entry_type, ContinuationType::Promise);
        assert_eq!(entry2.dependencies, vec![seq1]);
    }

    #[test]
    fn wal_persistence_across_restart() {
        let dir = tempdir().unwrap();
        {
            let mut wal = ContinuationWal::new(dir.path()).unwrap();
            wal.append(ContinuationAppend { entry_type: ContinuationType::Barrier, payload: serde_json::json!({ "id": "b1" }), dependencies: vec![] }).unwrap();
            wal.append(ContinuationAppend { entry_type: ContinuationType::Promise, payload: serde_json::json!({ "id": "p1" }), dependencies: vec![] }).unwrap();
        }

        let wal = ContinuationWal::new(dir.path()).unwrap();
        assert_eq!(wal.latest_seq(), 2);
        assert_eq!(wal.read_all().len(), 2);
    }

    #[test]
    fn wal_verify_integrity() {
        let dir = tempdir().unwrap();
        let mut wal = ContinuationWal::new(dir.path()).unwrap();
        wal.append(ContinuationAppend { entry_type: ContinuationType::Barrier, payload: serde_json::json!({ "id": "b1" }), dependencies: vec![] }).unwrap();
        assert!(wal.verify_integrity());
    }

    #[test]
    fn checkpoint_save_and_load() {
        let dir = tempdir().unwrap();
        let store = CheckpointStore::new(dir.path()).unwrap();

        let checkpoint = OrchestrationCheckpoint::new(5, serde_json::json!({ "state": "running" }));
        store.save(&checkpoint).unwrap();

        let loaded = store.load().unwrap().unwrap();
        assert_eq!(loaded.seq_id, 5);
        assert_eq!(loaded.orchestrator_state["state"], "running");
    }

    #[test]
    fn immutable_checkpoint_history_rejects_corruption() {
        let dir = tempdir().unwrap();
        let store = CheckpointStore::new(dir.path()).unwrap();
        store.save(&OrchestrationCheckpoint::new(1, serde_json::json!({ "state": "first" }))).unwrap();
        store.save(&OrchestrationCheckpoint::new(2, serde_json::json!({ "state": "second" }))).unwrap();
        assert_eq!(store.load().unwrap().unwrap().seq_id, 2);
        let first = fs::read_dir(dir.path()).unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| path.file_name().unwrap().to_string_lossy().starts_with("checkpoint-1-"))
            .unwrap();
        fs::write(first, b"tampered").unwrap();
        assert_eq!(store.load().unwrap_err().kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn immutable_checkpoint_history_rejects_ambiguous_sequence() {
        let dir = tempdir().unwrap();
        let store = CheckpointStore::new(dir.path()).unwrap();
        store.save(&OrchestrationCheckpoint::new(4, serde_json::json!({ "state": "first" }))).unwrap();
        store.save(&OrchestrationCheckpoint::new(4, serde_json::json!({ "state": "second" }))).unwrap();
        assert_eq!(store.load().unwrap_err().kind(), std::io::ErrorKind::InvalidData);
    }
