use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SNAPSHOT_TICK: u64 = 81;

#[test]
fn divided_cells_and_genomes_survive_process_restart() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-division-process-{nonce}.jsonl"));
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("division-process-source");
    source.set_mission_id(mission);
    source.seed_germline(source.orchestrator.orchestrator_id, "RESTART_DIVISION").unwrap();
    let receipt = source
        .divide_for_mission_with_snapshot(&BiologicalReceiptStore::open(&path), SNAPSHOT_TICK)
        .unwrap();
    let receipt_id = receipt.receipt_id;
    drop(source);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "division_restart_child_process", "--nocapture"])
        .env("GENOS_DIVISION_JOURNAL", &path)
        .env("GENOS_DIVISION_MISSION", mission.to_string())
        .env("GENOS_DIVISION_RECEIPT", receipt_id.to_string())
        .output()
        .unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(
        child.status.success(),
        "process-restart division recovery failed: {}",
        String::from_utf8_lossy(&child.stderr)
    );
}

#[test]
fn division_restart_child_process() {
    let Ok(path) = std::env::var("GENOS_DIVISION_JOURNAL") else {
        return;
    };
    let mission = std::env::var("GENOS_DIVISION_MISSION").unwrap().parse::<Uuid>().unwrap();
    let receipt_id = std::env::var("GENOS_DIVISION_RECEIPT").unwrap().parse::<Uuid>().unwrap();
    let journal = BiologicalReceiptStore::open(path);
    let mut recovered = GenosEcosystem::new("division-process-recovered");
    recovered.set_mission_id(mission);

    let receipt = recovered.restore_mission_division(&journal).unwrap();

    assert_eq!(receipt.receipt_id, receipt_id);
    assert_eq!(receipt.mission_id, mission);
    assert!(recovered.orchestrator.active_cells.contains_key(&receipt.parent_cell_id.unwrap()));
    assert!(recovered.orchestrator.active_cells.contains_key(&receipt.daughter_cell_id.unwrap()));
    assert_eq!(recovered.receipt_tick, SNAPSHOT_TICK);
}
