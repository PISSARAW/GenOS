use super::*;
use serde_json::Value;

#[test]
fn seeded_crossover_is_durable_idempotent_and_replayable_after_restart() {
    let directory = tempfile::tempdir().unwrap();
    let store_path = directory.path().join("crossovers.jsonl");
    let store = BiologicalReceiptStore::open(&store_path);
    let mission_id = Uuid::new_v4();
    let mut ecosystem = GenosEcosystem::new("crossover-test");
    ecosystem.set_mission_id(mission_id);
    ecosystem.orchestrator.create_tissue("Arena", "Reproduction").unwrap();
    let a_cell = ecosystem.orchestrator.orchestrator_id;
    let a_genome = ecosystem.seed_germline(a_cell, "parent A").unwrap();
    let b_cell = ecosystem.orchestrator.add_worker("Arena", AgentCell::new("B", "parent B", "cell")).unwrap();
    let b_genome = ecosystem.seed_germline(b_cell, "parent B").unwrap();

    let request = CrossoverRequest { parent_a_cell_id: a_cell, parent_b_cell_id: b_cell, seed: 941 };
    let receipt = ecosystem.crossover_for_mission(request, &store).unwrap();
    let retry = ecosystem.crossover_for_mission(
        CrossoverRequest { parent_a_cell_id: a_cell, parent_b_cell_id: b_cell, seed: 941 }, &store,
    ).unwrap();
    assert_eq!(receipt.child_fingerprint, retry.child_fingerprint);
    assert_eq!(receipt.parent_a.fingerprint.genome_id, a_genome);
    assert_eq!(receipt.parent_b.fingerprint.genome_id, b_genome);
    assert_eq!(receipt.child_genome.parent_ids, vec![a_genome, b_genome]);
    assert_eq!(store.read_all().unwrap().len(), 1);

    let reopened = BiologicalReceiptStore::open(&store_path);
    let mut restored = GenosEcosystem::new("crossover-restart");
    restored.set_mission_id(mission_id);
    let replayed = restored.replay_crossover_for_mission(&receipt.idempotency_key, &reopened).unwrap();
    assert_eq!(replayed.child_fingerprint, receipt.child_fingerprint);
    assert!(restored.orchestrator.active_cells.contains_key(&receipt.child_cell.cell_id));
    assert_eq!(restored.orchestrator.genomes[&receipt.child_genome.genome_id()].fingerprint().unwrap(), receipt.child_fingerprint);
}

#[test]
fn replay_rejects_wrong_mission_and_tampered_child() {
    let directory = tempfile::tempdir().unwrap();
    let store = BiologicalReceiptStore::open(directory.path().join("crossovers.jsonl"));
    let mut ecosystem = GenosEcosystem::new("crossover-test");
    let mission_id = Uuid::new_v4();
    ecosystem.set_mission_id(mission_id);
    ecosystem.orchestrator.create_tissue("Arena", "Reproduction").unwrap();
    let a = ecosystem.orchestrator.orchestrator_id;
    ecosystem.seed_germline(a, "parent A").unwrap();
    let b = ecosystem.orchestrator.add_worker("Arena", AgentCell::new("B", "parent B", "cell")).unwrap();
    ecosystem.seed_germline(b, "parent B").unwrap();
    let receipt = ecosystem.crossover_for_mission(CrossoverRequest { parent_a_cell_id: a, parent_b_cell_id: b, seed: 42 }, &store).unwrap();
    let mut wrong = GenosEcosystem::new("wrong-mission");
    wrong.set_mission_id(Uuid::new_v4());
    assert!(wrong.replay_crossover_for_mission(&receipt.idempotency_key, &store).is_err());

    let mut value: Value = store.read_all().unwrap().remove(0);
    value["child_genome"]["generation"] = serde_json::json!(999);
    assert!(validate_receipt(&serde_json::from_value(value).unwrap(), mission_id).is_err());

    let child_id = receipt.child_genome.genome_id();
    ecosystem.orchestrator.genomes.get_mut(&child_id).unwrap().generation += 1;
    assert!(ecosystem.replay_crossover_for_mission(&receipt.idempotency_key, &store)
        .unwrap_err().contains("child genome conflicts"));
    ecosystem.orchestrator.genomes.insert(child_id, receipt.child_genome.clone());
    ecosystem.orchestrator.active_cells.get_mut(&receipt.child_cell.cell_id).unwrap().name
        .push_str(" altered");
    assert!(ecosystem.replay_crossover_for_mission(&receipt.idempotency_key, &store)
        .unwrap_err().contains("child cell conflicts"));
    ecosystem.orchestrator.active_cells.insert(
        receipt.child_cell.cell_id, receipt.child_cell.clone());
    ecosystem.orchestrator.active_cells.get_mut(&receipt.parent_a.cell.cell_id).unwrap().name
        .push_str(" altered");
    assert!(ecosystem.replay_crossover_for_mission(&receipt.idempotency_key, &store)
        .unwrap_err().contains("parent cell conflicts"));
}
