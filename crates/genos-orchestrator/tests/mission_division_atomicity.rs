use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn failing_journal_path() -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir()
        .join(format!("genos-division-failure-{nonce}"))
        .join("receipts.jsonl")
}

fn seeded_ecosystem() -> GenosEcosystem {
    let mut ecosystem = GenosEcosystem::new("division-atomicity");
    ecosystem.set_mission_id(Uuid::new_v4());
    ecosystem
        .seed_germline(ecosystem.orchestrator.orchestrator_id, "ATOMIC_DIVISION")
        .unwrap();
    ecosystem
}

fn observable_state(ecosystem: &GenosEcosystem) -> Value {
    json!({
        "population": ecosystem.population_state_receipt(73).unwrap(),
        "orchestrator": serde_json::to_value(&ecosystem.orchestrator).unwrap(),
        "atp": ecosystem.orchestrator.metabolism.atp,
        "consumed": ecosystem.orchestrator.metabolism.consumed_total,
        "events": ecosystem.events.snapshot(),
        "neuro": serde_json::to_value(&ecosystem.neuro.system).unwrap(),
        "quorum": serde_json::to_value(&ecosystem.quorum).unwrap(),
    })
}

#[test]
fn receipt_append_failure_rolls_back_division_state() {
    let mut ecosystem = seeded_ecosystem();
    let before = observable_state(&ecosystem);
    let path = failing_journal_path();

    let result = ecosystem.divide_for_mission(&BiologicalReceiptStore::open(&path));

    assert!(result.is_err());
    assert_eq!(observable_state(&ecosystem), before);
    assert!(!path.exists());
}

#[test]
fn batched_recovery_append_failure_rolls_back_division_state() {
    let mut ecosystem = seeded_ecosystem();
    let before = observable_state(&ecosystem);
    let path = failing_journal_path();

    let result = ecosystem.divide_for_mission_with_snapshot(
        &BiologicalReceiptStore::open(&path),
        73,
    );

    assert!(result.is_err());
    assert_eq!(observable_state(&ecosystem), before);
    assert!(!path.exists());
}
