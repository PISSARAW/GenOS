use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::checkpoint::OrchestratorCheckpointState;
use genos_store::BiologicalReceiptStore;
use uuid::Uuid;

#[test]
fn campaign_seed_restores_reproduction_and_rejects_changes_before_state_mutation() {
    let root = std::env::temp_dir().join(format!("genos-reproduction-seed-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let journal = root.join("mission.jsonl");
    let mission_id = Uuid::new_v4();
    let mut seeded = GenosEcosystem::new("campaign seed restore");
    seeded.set_mission_id(mission_id);
    seeded.set_reproduction_seed(41).unwrap();
    let checkpoint = OrchestratorCheckpointState::from_ecosystem(&seeded).unwrap();

    let mut restored = GenosEcosystem::new("campaign seed restore");
    restored.set_mission_id(mission_id);
    assert!(checkpoint.apply_to_ecosystem(&mut restored).unwrap());
    assert_eq!(restored.reproduction_seed(), Some(41));

    let initial_population = seeded.population_state_receipt(0).unwrap();
    BiologicalReceiptStore::open(&journal).append_receipts(&[initial_population]).unwrap();
    restored.configure_receipt_journal(journal.clone());
    restored.resume_mission_from_journal(mission_id).unwrap();
    assert_eq!(restored.reproduction_seed(), Some(41));

    let mut wrong_seed = GenosEcosystem::new("campaign seed restore");
    wrong_seed.set_mission_id(mission_id);
    wrong_seed.set_reproduction_seed(42).unwrap();
    wrong_seed.configure_receipt_journal(journal);
    let cells_before = wrong_seed.orchestrator.active_cells.clone();
    assert_eq!(wrong_seed.resume_mission_from_journal(mission_id).unwrap_err(), "reproduction campaign seed mismatch");
    assert_eq!(wrong_seed.reproduction_seed(), Some(42));
    assert_eq!(
        serde_json::to_value(&wrong_seed.orchestrator.active_cells).unwrap(),
        serde_json::to_value(&cells_before).unwrap(),
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn same_seed_retries_idempotently_and_distinct_seeds_derive_distinct_child_ids() {
    let root = std::env::temp_dir().join(format!("genos-reproduction-idempotency-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let mission_id = Uuid::new_v4();
    let store = BiologicalReceiptStore::open(root.join("mission.jsonl"));
    let mut first = seeded_founder(mission_id);
    let checkpoint = OrchestratorCheckpointState::from_ecosystem(&first).unwrap();
    first.set_reproduction_seed(41).unwrap();
    let first_receipt = first.reproduce_and_archive_lineage(&store).unwrap();
    let entries_before_retry = store.read_all().unwrap();

    let mut retry = GenosEcosystem::new("same campaign state");
    retry.set_mission_id(mission_id);
    checkpoint.apply_to_ecosystem(&mut retry).unwrap();
    retry.set_reproduction_seed(41).unwrap();
    let retry_receipt = retry.reproduce_and_archive_lineage(&store).unwrap();
    assert_eq!(
        serde_json::to_value(&first_receipt).unwrap(),
        serde_json::to_value(&retry_receipt).unwrap(),
    );
    assert_eq!(store.read_all().unwrap(), entries_before_retry, "exact retry must not append duplicate receipt or snapshot");

    let collision_store = BiologicalReceiptStore::open(root.join("collision.jsonl"));
    collision_store.append_receipts(&[serde_json::json!({
        "schema": "genos.reproduction-lineage-receipt/v1",
        "idempotency_key": first_receipt.idempotency_key,
        "poisoned": true,
    })]).unwrap();
    let mut collision = GenosEcosystem::new("same campaign state");
    collision.set_mission_id(mission_id);
    checkpoint.apply_to_ecosystem(&mut collision).unwrap();
    collision.set_reproduction_seed(41).unwrap();
    let cells_before_collision = serde_json::to_value(&collision.orchestrator.active_cells).unwrap();
    assert_eq!(
        collision.reproduce_and_archive_lineage(&collision_store).unwrap_err(),
        "reproduction idempotency key collision",
    );
    assert_eq!(serde_json::to_value(&collision.orchestrator.active_cells).unwrap(), cells_before_collision);

    let mut distinct_seed = GenosEcosystem::new("same campaign state");
    distinct_seed.set_mission_id(mission_id);
    checkpoint.apply_to_ecosystem(&mut distinct_seed).unwrap();
    distinct_seed.set_reproduction_seed(42).unwrap();
    let distinct_receipt = distinct_seed.reproduce_and_archive_lineage(
        &BiologicalReceiptStore::open(root.join("distinct-seed.jsonl")),
    ).unwrap();
    assert_ne!(first_receipt.daughter_cell.cell_id, distinct_receipt.daughter_cell.cell_id);
    assert_ne!(first_receipt.daughter_genome.genome_id(), distinct_receipt.daughter_genome.genome_id());
    let _ = std::fs::remove_dir_all(root);
}

fn seeded_founder(mission_id: Uuid) -> GenosEcosystem {
    let mut ecosystem = GenosEcosystem::new("same campaign state");
    ecosystem.set_mission_id(mission_id);
    let founder = ecosystem.orchestrator.orchestrator_id;
    ecosystem.seed_germline(founder, "same campaign state").unwrap();
    ecosystem.feed(1_000.0);
    ecosystem
}
