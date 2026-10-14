use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::mission_neuro_glia_receipt::DurableNeuroGliaEvent;
use genos_orchestrator::GenosEcosystem;
use serde_json::json;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SNAPSHOT_TICK: u64 = 94;

#[test]
fn glial_response_and_population_replay_in_child_process() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-neuro-glia-{nonce}.jsonl"));
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("glial-response-source");
    source.set_mission_id(mission);
    let root_cell = source.orchestrator.orchestrator_id;
    let receipt = source.record_event_with_durable_neuro_glia_response(
        &BiologicalReceiptStore::open(&path),
        DurableNeuroGliaEvent {
            event_type: "BIOLOGICAL_EXECUTION_RECEIPT".into(),
            payload: json!({"completed": true, "cost": 1.0}),
            tick: SNAPSHOT_TICK,
        },
    ).unwrap();
    let event_id = receipt["source_event_id"].as_str().unwrap().to_string();
    drop(source);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "glial_response_restart_child_process", "--nocapture"])
        .env("GENOS_NEURO_GLIA_JOURNAL", &path)
        .env("GENOS_NEURO_GLIA_MISSION", mission.to_string())
        .env("GENOS_NEURO_GLIA_EVENT", event_id)
        .env("GENOS_NEURO_GLIA_ROOT", root_cell.to_string())
        .output().unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "glial response recovery failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn glial_response_restart_child_process() {
    let Ok(path) = std::env::var("GENOS_NEURO_GLIA_JOURNAL") else { return; };
    let mission = std::env::var("GENOS_NEURO_GLIA_MISSION").unwrap().parse::<Uuid>().unwrap();
    let event_id = std::env::var("GENOS_NEURO_GLIA_EVENT").unwrap();
    let root_cell = std::env::var("GENOS_NEURO_GLIA_ROOT").unwrap().parse::<Uuid>().unwrap();
    let mut recovered = GenosEcosystem::new("glial-response-recovered");
    recovered.set_mission_id(mission);

    let response = recovered.replay_neuro_glia_response(&BiologicalReceiptStore::open(path)).unwrap();

    assert_eq!(response["missionId"], mission.to_string());
    assert_eq!(response["sourceEventId"], event_id);
    assert_eq!(response["sourceEventType"], "BIOLOGICAL_EXECUTION_RECEIPT");
    assert!(response["glial"]["astrocyteAtpAfterSupport"].is_number());
    assert!(response["quorum"]["activeCellCount"].is_number());
    assert!(recovered.orchestrator.active_cells.contains_key(&root_cell));
    assert_eq!(recovered.receipt_tick, SNAPSHOT_TICK);
}
