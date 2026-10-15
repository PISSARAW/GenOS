use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn scratch_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-sensory-paf-{nonce}-{name}"))
}

fn alarm_input() -> PathBuf {
    let path = scratch_path("input.json");
    std::fs::write(&path, json!({"signal": {
        "sensor": "vomeronasal",
        "signal": {
            "source_agent": "synthetic-source", "locus": "test/sensor",
            "pheromone_type": "Alarm", "concentration": 0.9,
            "half_life_secs": 60.0, "timestamp_epoch_ms": 1,
            "subliminal_payload": {}
        }
    }}).to_string()).unwrap();
    path
}

fn run_ingest(workspace: &Path, mission: Uuid, input: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .env("GENOS_STUDIO_ROOT", workspace)
        .args(["sensory-ingest", "--mission-id", mission.to_string().as_str(), "--replay-key", "paf-test-1", "--experimental"])
        .arg("--input").arg(input).output().unwrap()
}

fn run_tick(workspace: &Path, mission: Uuid) -> Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .env("GENOS_STUDIO_ROOT", workspace)
        .args(["biological", "--tick", "--mission-id", mission.to_string().as_str(), "--mission", "sensory-paf-test"])
        .output().unwrap()
}

fn read_receipts(workspace: &Path, mission: Uuid) -> Vec<Value> {
    BiologicalReceiptStore::open(workspace.join("biological-receipts").join(format!("{mission}.jsonl")))
        .read_all().unwrap()
}

#[test]
fn process_tick_bridges_one_verified_alarm_once_and_persists_its_paf_decision() {
    let mission = Uuid::new_v4();
    let workspace = scratch_path("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let input = alarm_input();
    let ingested = run_ingest(&workspace, mission, &input);
    assert!(ingested.status.success(), "{}", String::from_utf8_lossy(&ingested.stderr));
    let source = serde_json::from_slice::<Value>(&ingested.stdout).unwrap();

    let first_tick = run_tick(&workspace, mission);
    assert!(first_tick.status.success(), "{}", String::from_utf8_lossy(&first_tick.stderr));
    let receipts = read_receipts(&workspace, mission);
    let paf = receipts.iter().find(|item| item["schema"] == "genos.instinct-paf-receipt/v1" && item["tick"] == 1)
        .expect("first process tick persists PAF decision");
    assert_eq!(paf["sensory_source_refs"][0]["event_id"], source["event_id"]);
    assert_eq!(paf["sensory_source_refs"][0]["source_digest"], source["source_digest"]);
    assert!(paf["stimuli"].as_array().unwrap().iter().any(|stimulus| stimulus["signature"] == "threat_detected"));
    assert_eq!(paf["evaluation"]["released"], true);
    assert!(paf["actions"].as_array().unwrap().is_empty(), "unexpected external action receipt: {paf}");
    assert_eq!(paf["actions"].as_array().unwrap().len(), 0, "synthetic signals never execute external actions implicitly");

    let second_tick = run_tick(&workspace, mission);
    assert!(second_tick.status.success(), "{}", String::from_utf8_lossy(&second_tick.stderr));
    let receipts = read_receipts(&workspace, mission);
    let next = receipts.iter().find(|item| item["schema"] == "genos.instinct-paf-receipt/v1" && item["tick"] == 2)
        .expect("second tick persists its independent decision");
    assert_eq!(next["sensory_source_refs"].as_array().unwrap().len(), 0, "an input receipt is consumed at most once");
    let _ = std::fs::remove_file(input);
    let _ = std::fs::remove_dir_all(workspace);
}

#[test]
fn process_tick_refuses_a_sensory_receipt_with_changed_content_and_old_digest() {
    let mission = Uuid::new_v4();
    let workspace = scratch_path("tampered-workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let input = alarm_input();
    assert!(run_ingest(&workspace, mission, &input).status.success());
    let journal = workspace.join("biological-receipts").join(format!("{mission}.jsonl"));
    let mut tampered = read_receipts(&workspace, mission)[0].clone();
    tampered["source_receipt"]["signal"]["signal"]["concentration"] = json!(0.1);
    std::fs::remove_file(&journal).unwrap();
    BiologicalReceiptStore::open(&journal).append_receipts(&[tampered]).unwrap();

    let tick = run_tick(&workspace, mission);
    assert!(!tick.status.success(), "a digest mismatch must stop the process tick");
    assert!(String::from_utf8_lossy(&tick.stderr).contains("digest mismatch"), "stdout={} stderr={}", String::from_utf8_lossy(&tick.stdout), String::from_utf8_lossy(&tick.stderr));
    assert!(!read_receipts(&workspace, mission).iter().any(|item| item["schema"] == "genos.instinct-paf-receipt/v1"));
    let _ = std::fs::remove_file(input);
    let _ = std::fs::remove_dir_all(workspace);
}

#[test]
fn process_tick_refuses_a_receipt_from_another_mission_in_its_journal() {
    let mission = Uuid::new_v4();
    let foreign_mission = Uuid::new_v4();
    let workspace = scratch_path("foreign-mission-workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let input = alarm_input();
    assert!(run_ingest(&workspace, foreign_mission, &input).status.success());
    let foreign_receipt = read_receipts(&workspace, foreign_mission)[0].clone();
    let mission_journal = workspace.join("biological-receipts").join(format!("{mission}.jsonl"));
    BiologicalReceiptStore::open(&mission_journal).append_receipts(&[foreign_receipt]).unwrap();

    let tick = run_tick(&workspace, mission);
    assert!(!tick.status.success());
    assert!(String::from_utf8_lossy(&tick.stderr).contains("mission does not match"));
    assert!(!read_receipts(&workspace, mission).iter().any(|item| item["schema"] == "genos.instinct-paf-receipt/v1"));
    let _ = std::fs::remove_file(input);
    let _ = std::fs::remove_dir_all(workspace);
}

#[test]
fn process_tick_refuses_a_paf_receipt_with_zero_tick() {
    let mission = Uuid::new_v4();
    let workspace = scratch_path("future-tick-workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::create_dir_all(workspace.join("biological-receipts")).unwrap();
    let journal = workspace.join("biological-receipts").join(format!("{mission}.jsonl"));
    BiologicalReceiptStore::open(&journal).append_receipts(&[json!({
        "schema": "genos.instinct-paf-receipt/v1",
        "mission_id": mission,
        "tick": 0,
        "sensory_source_refs": []
    })]).unwrap();

    let tick = run_tick(&workspace, mission);
    assert!(!tick.status.success());
    assert!(String::from_utf8_lossy(&tick.stderr).contains("tick is incoherent"), "{}", String::from_utf8_lossy(&tick.stderr));
    let _ = std::fs::remove_dir_all(workspace);
}

#[test]
fn process_tick_accepts_a_historical_paf_receipt_without_source_refs() {
    let mission = Uuid::new_v4();
    let workspace = scratch_path("legacy-paf-workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::create_dir_all(workspace.join("biological-receipts")).unwrap();
    let journal = workspace.join("biological-receipts").join(format!("{mission}.jsonl"));
    BiologicalReceiptStore::open(&journal).append_receipts(&[
        json!({"schema": "genos.instinct-paf-receipt/v1", "mission_id": mission, "tick": 1}),
        json!({"schema": "genos.legacy-tick/v1", "mission_id": mission, "tick": 1}),
    ]).unwrap();

    let tick = run_tick(&workspace, mission);
    assert!(tick.status.success(), "{}", String::from_utf8_lossy(&tick.stderr));
    assert!(read_receipts(&workspace, mission).iter().any(|item|
        item["schema"] == "genos.instinct-paf-receipt/v1" && item["tick"] == 2));
    let _ = std::fs::remove_dir_all(workspace);
}
