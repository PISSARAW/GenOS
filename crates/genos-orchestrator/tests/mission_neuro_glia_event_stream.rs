use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::mission_neuro_glia_receipt::NeuroGliaStreamEvent;
use genos_orchestrator::GenosEcosystem;
use serde_json::{Value, json};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn journal_path(label: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-neuro-glia-{label}-{nonce}.jsonl"))
}

fn event(key: &str, cost: f64, tick: u64) -> NeuroGliaStreamEvent {
    NeuroGliaStreamEvent {
        idempotency_key: key.into(),
        event_type: "BIOLOGICAL_EXECUTION_RECEIPT".into(),
        payload: json!({"completed": true, "cost": cost}),
        tick,
    }
}

#[test]
fn ordered_neuro_glia_stream_replays_after_process_restart() {
    if std::env::var_os("GENOS_NEURO_GLIA_STREAM_CHILD").is_some() {
        replay_child();
        return;
    }
    let path = journal_path("stream");
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("glial-stream-source");
    source.set_mission_id(mission);
    let root_cell = source.orchestrator.orchestrator_id;
    let store = BiologicalReceiptStore::open(&path);
    source.record_neuro_glia_stream_event(&store, event("event-1", 1.0, 10)).unwrap();
    source.record_neuro_glia_stream_event(&store, event("event-2", 2.0, 11)).unwrap();
    source.record_neuro_glia_stream_event(&store, event("event-3", 3.0, 12)).unwrap();
    drop(source);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "ordered_neuro_glia_stream_replays_after_process_restart", "--nocapture"])
        .env("GENOS_NEURO_GLIA_STREAM_CHILD", "1")
        .env("GENOS_NEURO_GLIA_STREAM_PATH", &path)
        .env("GENOS_NEURO_GLIA_STREAM_MISSION", mission.to_string())
        .env("GENOS_NEURO_GLIA_STREAM_ROOT", root_cell.to_string())
        .output().unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "stream recovery failed: {}", String::from_utf8_lossy(&child.stderr));
}

fn replay_child() {
    let path = std::env::var("GENOS_NEURO_GLIA_STREAM_PATH").unwrap();
    let mission = std::env::var("GENOS_NEURO_GLIA_STREAM_MISSION").unwrap().parse::<Uuid>().unwrap();
    let root = std::env::var("GENOS_NEURO_GLIA_STREAM_ROOT").unwrap().parse::<Uuid>().unwrap();
    let mut restored = GenosEcosystem::new("glial-stream-restored");
    restored.set_mission_id(mission);
    let stream = restored.replay_neuro_glia_event_stream(&BiologicalReceiptStore::open(path)).unwrap();
    assert_eq!(stream.len(), 3);
    assert_eq!(stream.iter().map(|entry| entry["idempotency_key"].as_str().unwrap()).collect::<Vec<_>>(), ["event-1", "event-2", "event-3"]);
    assert_eq!(stream.iter().map(|entry| entry["sequence"].as_u64().unwrap()).collect::<Vec<_>>(), [1, 2, 3]);
    assert_eq!(stream.last().unwrap()["tick"], 12);
    assert!(restored.orchestrator.active_cells.contains_key(&root));
    assert_eq!(restored.receipt_tick, 12);
}

#[test]
fn stream_idempotency_mission_scope_and_corruption_fail_closed() {
    let path = journal_path("guard");
    let mission = Uuid::new_v4();
    let store = BiologicalReceiptStore::open(&path);
    let mut ecosystem = GenosEcosystem::new("glial-stream-guards");
    ecosystem.set_mission_id(mission);
    let first = ecosystem.record_neuro_glia_stream_event(&store, event("same", 1.0, 1)).unwrap();
    let repeated = ecosystem.record_neuro_glia_stream_event(&store, event("same", 1.0, 1)).unwrap();
    assert_eq!(first, repeated);
    assert!(ecosystem.record_neuro_glia_stream_event(&store, event("same", 1.0, 99)).is_err());
    assert!(ecosystem.record_neuro_glia_stream_event(&store, event("same", 2.0, 2)).is_err());

    let mut foreign = GenosEcosystem::new("glial-stream-foreign");
    foreign.set_mission_id(Uuid::new_v4());
    assert!(foreign.replay_neuro_glia_event_stream(&store).is_err());

    let mut contents = std::fs::read_to_string(&path).unwrap();
    contents = contents.replace("\"sequence\":1", "\"sequence\":7");
    std::fs::write(&path, contents).unwrap();
    assert!(ecosystem.replay_neuro_glia_event_stream(&store).is_err());
    let _ = std::fs::remove_file(path);
}

#[test]
fn event_without_mission_response_is_refused_without_stream_append() {
    let path = journal_path("refusal");
    let mission = Uuid::new_v4();
    let store = BiologicalReceiptStore::open(&path);
    let mut ecosystem = GenosEcosystem::new("glial-stream-refusal");
    ecosystem.set_mission_id(mission);
    let unsupported = NeuroGliaStreamEvent {
        idempotency_key: "unsupported".into(),
        event_type: "UNRELATED_EVENT".into(),
        payload: Value::Null,
        tick: 1,
    };
    assert!(ecosystem.record_neuro_glia_stream_event(&store, unsupported).is_err());
    assert!(!store.read_all().unwrap().iter().any(|entry| entry["schema"] == "genos.mission-neuro-glia-event/v1"));
    let _ = std::fs::remove_file(path);
}
