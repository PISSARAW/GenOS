use genos_orchestrator::{GenosEcosystem, Goal, genos_store::BiologicalReceiptStore, genos_cell::AgentCell};
use uuid::Uuid;
use genos_orchestrator::genos_biology::spore::SporeType;

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

#[test]
fn population_journal_restores_dormant_spore_and_lineage_after_reopen() {
    let path = std::env::temp_dir().join(format!("genos-spore-recovery-{}.jsonl", Uuid::new_v4()));
    let mission_id = Uuid::new_v4();
    let mut source = GenosEcosystem::new("spore-journal-source");
    source.set_mission_id(mission_id);
    source.orchestrator.create_tissue("Tissue", "Worker").unwrap();
    let cell = source.orchestrator.add_worker("Tissue", AgentCell::new("spore", "w", "Soma")).unwrap();
    let genome_id = source.seed_germline(cell, "DURABLE_SPORE").unwrap();
    let lineage_id = source.orchestrator.genomes[&genome_id].lineage_id();
    source.orchestrator.sporulate_cell(cell, SporeType::BacterialEndospore).unwrap();
    let snapshot = source.population_state_receipt(9).unwrap();
    BiologicalReceiptStore::open(&path).append_receipts(&[snapshot]).unwrap();

    let reopened = BiologicalReceiptStore::open(&path);
    let mut restored = GenosEcosystem::new("spore-journal-restored");
    restored.restore_population(&reopened).unwrap();

    assert_eq!(restored.mission_id, Some(mission_id));
    assert_eq!(restored.receipt_tick, 9);
    assert_eq!(restored.orchestrator.dormant_spores.len(), 1);
    let spore = &restored.orchestrator.dormant_spores[0];
    assert_eq!(spore.spore_type, SporeType::BacterialEndospore);
    assert_eq!(spore.genome.genome_id(), genome_id);
    assert_eq!(spore.genome.lineage_id(), lineage_id);
    assert_eq!(spore.bunker_armor, 9999);
    assert_eq!(restored.orchestrator.spore_tissue_map.get(&cell).map(String::as_str), Some("Tissue"));
    let revived = restored.orchestrator.germinate_spore(0, (true, true)).unwrap();
    assert_eq!(revived.cell_id, cell);
    assert_eq!(revived.genome_id, Some(genome_id));
    let _ = std::fs::remove_file(path);
}
