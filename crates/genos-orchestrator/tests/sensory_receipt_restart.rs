use genos_orchestrator::animal_sensory_runtime::SyntheticAnimalSignal;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::sensory_receipt_runtime::{
    persist_synthetic_sensory_receipt, read_synthetic_sensory_receipts,
};
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[test]
fn synthetic_sensory_receipt_survives_process_restart() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-sensory-receipts-{nonce}.jsonl"));
    let mission_id = Uuid::new_v4();
    let mut ecosystem = GenosEcosystem::new("sensory-receipt-source");
    ecosystem.set_mission_id(mission_id);
    let source = ecosystem.ingest_synthetic_animal_signal(
        SyntheticAnimalSignal::PassiveElectroreception { ambient_uv: vec![0.2, 0.5, 0.9] },
    ).unwrap();
    let source = serde_json::to_value(source).unwrap();
    persist_synthetic_sensory_receipt(
        &BiologicalReceiptStore::open(&path), mission_id, &source,
    ).unwrap();
    let event_id = source["event_id"].as_str().unwrap().to_string();
    drop(ecosystem);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "sensory_receipt_restart_child_process", "--nocapture"])
        .env("GENOS_SENSORY_JOURNAL", &path)
        .env("GENOS_SENSORY_MISSION", mission_id.to_string())
        .env("GENOS_SENSORY_EVENT", event_id)
        .output().unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "sensory receipt restart failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn sensory_receipt_restart_child_process() {
    let Ok(path) = std::env::var("GENOS_SENSORY_JOURNAL") else { return; };
    let mission_id = std::env::var("GENOS_SENSORY_MISSION").unwrap().parse::<Uuid>().unwrap();
    let event_id = std::env::var("GENOS_SENSORY_EVENT").unwrap();
    let receipts = read_synthetic_sensory_receipts(&BiologicalReceiptStore::open(path), mission_id).unwrap();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0]["event_id"], event_id);
    assert_eq!(receipts[0]["origin"], "synthetic");
    assert!(receipts[0]["measurement"]["detected_micro_impulses"].is_number());
}
