use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::checkpoint::{
    CheckpointManager, OrchestratorCheckpointState, RecoveryPlan,
};
use genos_orchestrator::genos_biology::spore::SporeType;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_store::{ContinuationType, ContinuationWal};
use tempfile::tempdir;
use uuid::Uuid;

#[test]
fn checkpoint_manager_creation() {
    let dir = tempdir().unwrap();
    let manager = CheckpointManager::new(dir.path(), 10).unwrap();
    assert_eq!(manager.get_wal().latest_seq(), 0);
}

#[test]
fn checkpoint_restores_receipt_tick_without_reusing_a_sequence() {
    let mut source = GenosEcosystem::new("tick-checkpoint");
    source.receipt_tick = 7;
    let value = serde_json::to_value(OrchestratorCheckpointState::from_ecosystem(&source).unwrap()).unwrap();
    let state: OrchestratorCheckpointState = serde_json::from_value(value.clone()).unwrap();
    let mut restored = GenosEcosystem::new("tick-restored");
    assert!(state.apply_to_ecosystem(&mut restored).unwrap());
    assert_eq!(restored.receipt_tick, 7);
    let report = restored.tick(&genos_orchestrator::Goal::Explore);
    assert_eq!(report.tick, 8);
    let mut legacy = value;
    legacy.as_object_mut().unwrap().remove("receipt_tick");
    let state: OrchestratorCheckpointState = serde_json::from_value(legacy).unwrap();
    assert_eq!(state.receipt_tick, 0);
}

#[test]
fn checkpoint_manager_records_and_checkpoints() {
    let dir = tempdir().unwrap();
    let mut manager = CheckpointManager::new(dir.path(), 3).unwrap();
    manager
        .record_barrier("b1", &serde_json::json!({"state": "pending"}))
        .unwrap();
    manager
        .record_promise("p1", "pending", &serde_json::json!({}))
        .unwrap();
    let state = OrchestratorCheckpointState::new();
    assert!(!manager.maybe_checkpoint(&state).unwrap());
    manager
        .record_active_process(Uuid::new_v4(), &serde_json::json!({"status": "running"}))
        .unwrap();
    assert!(manager.maybe_checkpoint(&state).unwrap());
    let loaded = manager.load_latest_checkpoint().unwrap().unwrap();
    assert_eq!(loaded.seq_id, 3);
    assert_eq!(loaded.active_barriers.len(), 1);
    assert_eq!(loaded.active_promises.len(), 1);
    assert_eq!(loaded.active_processes.len(), 1);
}

#[test]
fn recovery_plan_generation() {
    let dir = tempdir().unwrap();
    let mut manager = CheckpointManager::new(dir.path(), 2).unwrap();
    manager
        .record_barrier("b1", &serde_json::json!({"state": "pending"}))
        .unwrap();
    manager
        .record_promise("p1", "pending", &serde_json::json!({}))
        .unwrap();
    manager
        .maybe_checkpoint(&OrchestratorCheckpointState::new())
        .unwrap();
    manager
        .record_active_process(Uuid::new_v4(), &serde_json::json!({"status": "running"}))
        .unwrap();
    let checkpoint = manager.load_latest_checkpoint().unwrap().unwrap();
    let plan = RecoveryPlan::from_checkpoint_and_wal(&checkpoint, manager.get_wal());
    assert_eq!(plan.checkpoint_seq, 2);
    assert_eq!(plan.wal_entries_to_replay, 2);
    assert_eq!(plan.barriers_to_restore.len(), 1);
    assert_eq!(plan.promises_to_restore.len(), 1);
    assert!(
        manager
            .get_wal()
            .read_all()
            .iter()
            .any(|entry| entry.entry_type == ContinuationType::Checkpoint)
    );
}

#[test]
fn durable_checkpoint_restores_spore_lineage_and_wake_state() {
    let dir = tempdir().unwrap();
    let mut source = GenosEcosystem::new("spore-checkpoint-source");
    source
        .orchestrator
        .create_tissue("Workers", "mission")
        .unwrap();
    let cell_id = source
        .orchestrator
        .add_worker(
            "Workers",
            AgentCell::new("dormant", "checkpointed worker", "Worker"),
        )
        .unwrap();
    let genome_id = source.seed_germline(cell_id, "SPORE_CHECKPOINT").unwrap();
    let lineage_id = source.orchestrator.genomes[&genome_id].lineage_id();
    assert!(
        source
            .orchestrator
            .metabolism
            .consume_for("checkpoint-test", 13.0)
    );
    source
        .orchestrator
        .sporulate_cell(cell_id, SporeType::BacterialEndospore)
        .unwrap();
    source.record_event(
        "CHECKPOINT_PREPARED",
        serde_json::json!({"mission": "spore"}),
    );

    let state = OrchestratorCheckpointState::from_ecosystem(&source).unwrap();
    let mut manager = CheckpointManager::new(dir.path(), 1).unwrap();
    manager.create_checkpoint(&state).unwrap();
    let checkpoint = manager.load_latest_checkpoint().unwrap().unwrap();
    let restored_state: OrchestratorCheckpointState =
        serde_json::from_value(checkpoint.orchestrator_state).unwrap();
    let mut restored = GenosEcosystem::new("restored");
    assert!(restored_state.apply_to_ecosystem(&mut restored).unwrap());

    assert_eq!(restored.orchestrator.dormant_spores.len(), 1);
    assert_eq!(
        restored.orchestrator.dormant_spores[0].genome.genome_id(),
        genome_id
    );
    assert_eq!(
        restored.orchestrator.dormant_spores[0].genome.lineage_id(),
        lineage_id
    );
    assert!((restored.orchestrator.metabolism.available() - 87.0).abs() < 0.01);
    assert_eq!(restored.events.count(), 1);
    assert_eq!(
        restored.events.read_stream(1)[0].event_type,
        "CHECKPOINT_PREPARED"
    );
    restored.record_event("CHECKPOINT_RESUMED", serde_json::json!({}));
    assert_eq!(restored.events.read_stream(1)[1].sequence, 2);
    assert!(
        restored
            .orchestrator
            .germinate_spore(0, (true, false))
            .is_err()
    );
    assert_eq!(restored.orchestrator.dormant_spores.len(), 1);
    let revived = restored
        .orchestrator
        .germinate_spore(0, (true, true))
        .unwrap();
    assert_eq!(revived.cell_id, cell_id);
    assert_eq!(revived.genome_id, Some(genome_id));

    let wal = ContinuationWal::new(dir.path()).unwrap();
    assert!(wal.verify_integrity());
}
