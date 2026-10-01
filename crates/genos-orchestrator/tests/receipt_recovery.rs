use genos_orchestrator::{GenosEcosystem, Goal, genos_store::BiologicalReceiptStore, genos_cell::AgentCell};
use uuid::Uuid;

#[test]
fn normal_tick_persists_and_population_restores_without_new_identity() {
    let path = std::env::temp_dir().join(format!("genos-normal-tick-{}.jsonl", Uuid::new_v4()));
    let store = BiologicalReceiptStore::open(&path);
    let mut ecosystem = GenosEcosystem::new("normal-tick");
    ecosystem.set_mission_id(Uuid::new_v4());
    ecosystem.orchestrator.create_tissue("Exec", "Worker").unwrap();
    let cell = ecosystem.orchestrator.add_worker("Exec", AgentCell::new("cell", "w", "Soma")).unwrap();
    let genome = ecosystem.seed_germline(cell, "DURABLE").unwrap();
    ecosystem.configure_receipt_journal(&path);
    ecosystem.feed(100.0);
    let report = ecosystem.tick(&Goal::SecurePerimeter);
    assert!(report.halt.is_none());
    let pending = store.pending_execution_receipts().unwrap();
    assert!(!pending.is_empty());
    let receipt_id = pending[0]["receipt_id"].clone();
    store.acknowledge(&receipt_id).unwrap();
    assert!(!BiologicalReceiptStore::open(&path).pending_execution_receipts().unwrap().iter()
        .any(|item| item["receipt_id"] == receipt_id));
    let mut restored = GenosEcosystem::new("restored");
    restored.restore_population(&store).unwrap();
    assert_eq!(restored.orchestrator.active_cells[&cell].genome_id, Some(genome));
    assert_eq!(restored.receipt_tick, report.tick);
    let _ = std::fs::remove_file(path);
}
