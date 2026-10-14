use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::metabolism::{MissionMetabolicPoolDemand, MissionMetabolicPoolReceipt};
use genos_orchestrator::metabolism_durable::MissionMetabolicPoolCommand;
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const JOURNAL_ENV: &str = "GENOS_METABOLISM_JOURNAL";
const RECEIPT_ENV: &str = "GENOS_METABOLISM_RECEIPT";

#[test]
fn metabolic_pool_state_and_operation_survive_process_restart() {
    if std::env::var_os(JOURNAL_ENV).is_some() { return; }
    let path = journal_path();
    let mission_id = Uuid::new_v4();
    let mut source = GenosEcosystem::new("metabolism-process-source");
    source.set_mission_id(mission_id);
    let cell_id = source.orchestrator.orchestrator_id;
    let pool = &mut source.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism;
    pool.amino_acids = 5.0;
    pool.cellular_waste = 7.0;
    pool.entropy_level = 0.25;
    let store = BiologicalReceiptStore::open(&path);
    store.append_receipts(&[source.population_state_receipt(3).unwrap()]).unwrap();

    let command = command(cell_id);
    let receipt = source.consume_mission_metabolic_pool_durable(&store, command.clone()).unwrap();
    assert!(receipt.accepted);
    assert_eq!(source.orchestrator.active_cells[&cell_id].metabolism.amino_acids, 3.0);
    let conflicting = MissionMetabolicPoolCommand {
        demand: MissionMetabolicPoolDemand { amino_acids: 4.0, ..command.demand.clone() },
        ..command
    };
    assert!(source.consume_mission_metabolic_pool_durable(&store, conflicting).is_err());
    assert_eq!(source.orchestrator.active_cells[&cell_id].metabolism.amino_acids, 3.0);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "metabolic_pool_restart_child", "--nocapture"])
        .env(JOURNAL_ENV, &path)
        .env(RECEIPT_ENV, serde_json::to_string(&receipt).unwrap())
        .output().unwrap();
    let _ = std::fs::remove_file(path);
    assert!(child.status.success(), "metabolic pool restart failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn metabolic_pool_restart_child() {
    let Ok(path) = std::env::var(JOURNAL_ENV) else { return; };
    let expected: MissionMetabolicPoolReceipt = serde_json::from_str(&std::env::var(RECEIPT_ENV).unwrap()).unwrap();
    let store = BiologicalReceiptStore::open(path);
    let mut restored = GenosEcosystem::new("metabolism-process-recovered");
    restored.set_mission_id(expected.mission_id);
    restored.restore_population(&store).unwrap();

    let cell = &restored.orchestrator.active_cells[&expected.cell_id];
    assert_eq!(restored.receipt_tick, 3);
    assert_eq!(cell.metabolism.amino_acids, 3.0);
    assert_eq!(cell.metabolism.cellular_waste, 7.0);
    assert_eq!(cell.metabolism.entropy_level, 0.25);
    let replayed = restored.consume_mission_metabolic_pool_durable(&store, command(expected.cell_id)).unwrap();
    assert_eq!(replayed, expected);
    assert_eq!(restored.orchestrator.active_cells[&expected.cell_id].metabolism.amino_acids, 3.0);
}

#[test]
fn failed_journal_append_rolls_back_pool_without_receipt_event() {
    let missing_parent = journal_path().with_extension("missing-parent").join("receipts.jsonl");
    let store = BiologicalReceiptStore::open(&missing_parent);
    let mut ecosystem = GenosEcosystem::new("metabolism-append-failure");
    ecosystem.set_mission_id(Uuid::new_v4());
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    ecosystem.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 5.0;

    assert!(ecosystem.consume_mission_metabolic_pool_durable(&store, command(cell_id)).is_err());
    assert_eq!(ecosystem.orchestrator.active_cells[&cell_id].metabolism.amino_acids, 5.0);
    assert!(!ecosystem.read_events(0).iter().any(|event| event.event_type == "MISSION_METABOLIC_POOL_RECEIPT"));
}

fn command(cell_id: Uuid) -> MissionMetabolicPoolCommand {
    MissionMetabolicPoolCommand {
        idempotency_key: "metabolic-restart-operation-1".into(),
        tick: 3,
        demand: MissionMetabolicPoolDemand { cell_id, operation: "mission.build".into(), amino_acids: 2.0 },
    }
}

fn journal_path() -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-metabolism-process-{nonce}.jsonl"))
}
