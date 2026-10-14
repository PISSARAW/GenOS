use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::guard_cell_durable::{MissionGuardFluxCommand, MissionGuardFluxReceipt};
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const JOURNAL_ENV: &str = "GENOS_GUARD_CELL_JOURNAL";
const RECEIPT_ENV: &str = "GENOS_GUARD_CELL_RECEIPT";

#[test]
fn guard_flux_state_and_idempotent_replay_survive_process_restart() {
    if std::env::var_os(JOURNAL_ENV).is_some() { return; }
    let path = journal_path();
    let mut source = GenosEcosystem::new("guard-process-source");
    let mission = Uuid::new_v4();
    source.set_mission_id(mission);
    let cell_id = source.orchestrator.orchestrator_id;
    source.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 50.0;
    let store = BiologicalReceiptStore::open(&path);
    let command = MissionGuardFluxCommand { idempotency_key: "guard-process-1".into(), tick: 8, requested_flux: 20.0 };
    let receipt = source.throttle_flux_for_mission_durable(&store, command.clone()).unwrap();
    assert!(receipt.accepted);
    assert!(receipt.result.admitted_flux > 0.0);
    store.append_receipts(&[source.population_state_receipt(9).unwrap()]).unwrap();
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "guard_flux_restart_child", "--nocapture"])
        .env(JOURNAL_ENV, &path)
        .env(RECEIPT_ENV, serde_json::to_string(&receipt).unwrap())
        .output().unwrap();
    let _ = std::fs::remove_file(path);
    assert!(child.status.success(), "guard flux restart failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn guard_flux_restart_child() {
    let Ok(path) = std::env::var(JOURNAL_ENV) else { return; };
    let expected: MissionGuardFluxReceipt = serde_json::from_str(&std::env::var(RECEIPT_ENV).unwrap()).unwrap();
    let store = BiologicalReceiptStore::open(path);
    let mut restored = GenosEcosystem::new("guard-process-recovered");
    restored.set_mission_id(expected.mission_id);
    restored.restore_population(&store).unwrap();
    restored.restore_guard_cell_state(&store).unwrap();
    assert_eq!(restored.receipt_tick, 9);
    assert_eq!(restored.orchestrator.active_cells[&expected.cell_id].metabolism.amino_acids, expected.amino_acids_after);
    let saved = store.find_idempotent_receipt("genos.population-state/v1", &expected.idempotency_key).unwrap().unwrap();
    let saved_atp: genos_orchestrator::metabolism::MetabolismCheckpoint = serde_json::from_value(saved["guard_atp_state"].clone()).unwrap();
    assert_eq!(restored.orchestrator.metabolism.available(), saved_atp.atp);
    assert_eq!(restored.orchestrator.metabolism.consumed_total, saved_atp.consumed_total);
    let command = MissionGuardFluxCommand { idempotency_key: expected.idempotency_key.clone(), tick: expected.tick, requested_flux: expected.requested_flux };
    let replayed = restored.throttle_flux_for_mission_durable(&store, command).unwrap();
    assert_eq!(serde_json::to_value(replayed).unwrap(), serde_json::to_value(&expected).unwrap());
    assert_eq!(restored.orchestrator.active_cells[&expected.cell_id].metabolism.amino_acids, expected.amino_acids_after);
}

#[test]
fn refused_guard_flux_persists_without_pool_or_pore_mutation() {
    let path = journal_path();
    let mut ecosystem = GenosEcosystem::new("guard-refusal-no-mutation");
    ecosystem.set_mission_id(Uuid::new_v4());
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    ecosystem.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 0.0;
    let original_pore = serde_json::to_value(&ecosystem.guard_cell).unwrap();
    let store = BiologicalReceiptStore::open(&path);
    let command = MissionGuardFluxCommand { idempotency_key: "guard-refusal-1".into(), tick: 2, requested_flux: 12.0 };
    let receipt = ecosystem.throttle_flux_for_mission_durable(&store, command).unwrap();
    assert!(!receipt.accepted);
    assert_eq!(receipt.result.admitted_flux, 0.0);
    assert_eq!(ecosystem.orchestrator.active_cells[&cell_id].metabolism.amino_acids, 0.0);
    assert_eq!(serde_json::to_value(&ecosystem.guard_cell).unwrap(), original_pore);
    assert!(store.read_all().unwrap().iter().any(|item| item["guard_flux_operation"]["accepted"] == false));
    let _ = std::fs::remove_file(path);
}

#[test]
fn guard_flux_append_failure_rolls_back_pool_energy_and_pore() {
    let missing_parent = journal_path().with_extension("missing-parent").join("receipts.jsonl");
    let store = BiologicalReceiptStore::open(&missing_parent);
    let mut ecosystem = GenosEcosystem::new("guard-append-rollback");
    ecosystem.set_mission_id(Uuid::new_v4());
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    ecosystem.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 50.0;
    let amino_before = ecosystem.orchestrator.active_cells[&cell_id].metabolism.amino_acids;
    let atp_before = ecosystem.atp();
    let pore_before = serde_json::to_value(&ecosystem.guard_cell).unwrap();
    let consumption_count = ecosystem.orchestrator.metabolism.consumption_receipts.len();

    assert!(ecosystem.throttle_flux_for_mission_durable(
        &store,
        MissionGuardFluxCommand { idempotency_key: "guard-append-failure".into(), tick: 1, requested_flux: 20.0 },
    ).is_err());
    assert_eq!(ecosystem.orchestrator.active_cells[&cell_id].metabolism.amino_acids, amino_before);
    assert_eq!(ecosystem.orchestrator.metabolism.available(), atp_before);
    assert_eq!(ecosystem.orchestrator.metabolism.consumption_receipts.len(), consumption_count);
    assert_eq!(serde_json::to_value(&ecosystem.guard_cell).unwrap(), pore_before);
}

fn journal_path() -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-guard-process-{nonce}.jsonl"))
}
