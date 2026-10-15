use serde_json::Value;
use std::process::Command;
use uuid::Uuid;

#[test]
fn crossover_is_authorized_scoped_persisted_and_idempotently_replayable() {
    let root = std::env::temp_dir().join(format!("genos-cli-crossover-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let initial = invoke(&root, &[
        "biological", "--tick", "--divide", "--mission-id", &mission_arg,
        "--mission", "authorized crossover mission",
    ]);
    assert!(initial.status.success(), "{}", String::from_utf8_lossy(&initial.stderr));
    let initial_report: Value = serde_json::from_slice(&initial.stdout).unwrap();
    let division = initial_report["receipts"].as_array().unwrap().iter()
        .find(|receipt| receipt["schema"] == "genos.cell-division-receipt/v1")
        .expect("persisted division should provide two registered crossover parents");
    let parent_a = division["parent_cell_id"].as_str().unwrap().to_owned();
    let parent_b = division["daughter_cell_id"].as_str().unwrap().to_owned();
    let crossover = invoke(&root, &[
        "biological", "--tick", "--mission-id", &mission_arg,
        "--mission", "authorized crossover mission", "--crossover-parent-a", &parent_a,
        "--crossover-parent-b", &parent_b, "--crossover-seed", "941",
    ]);
    assert!(crossover.status.success(), "{}", String::from_utf8_lossy(&crossover.stderr));
    let crossover_report: Value = serde_json::from_slice(&crossover.stdout).unwrap();
    let first_receipt = crossover_from(&crossover_report).clone();
    let crossover_tick = crossover_report["tick"].as_u64().unwrap();
    assert_eq!(first_receipt["mission_id"], mission_arg);
    assert_eq!(first_receipt["parent_a"]["cell"]["cell_id"], parent_a);
    assert_eq!(first_receipt["parent_b"]["cell"]["cell_id"], parent_b);

    let retry = invoke(&root, &[
        "biological", "--tick", "--mission-id", &mission_arg,
        "--mission", "authorized crossover mission", "--crossover-parent-a", &parent_a,
        "--crossover-parent-b", &parent_b, "--crossover-seed", "941",
    ]);
    assert!(retry.status.success(), "{}", String::from_utf8_lossy(&retry.stderr));
    let retry_report: Value = serde_json::from_slice(&retry.stdout).unwrap();
    assert_eq!(crossover_from(&retry_report), &first_receipt);
    assert_eq!(retry_report["tick"], crossover_tick,
        "an idempotent crossover retry must not advance the biological mission");

    let replay = invoke(&root, &[
        "biological", "--tick", "--mission-id", &mission_arg,
        "--mission", "authorized crossover mission", "--replay-crossover-key",
        first_receipt["idempotency_key"].as_str().unwrap(),
    ]);
    assert!(replay.status.success(), "{}", String::from_utf8_lossy(&replay.stderr));
    let replay_report: Value = serde_json::from_slice(&replay.stdout).unwrap();
    assert_eq!(crossover_from(&replay_report)["receipt_id"], first_receipt["receipt_id"]);
    assert_eq!(replay_report["tick"], crossover_tick,
        "receipt replay must restore the prior operation without advancing the mission");

    let records = journal_records(&root, mission_id);
    assert_eq!(records.iter().filter(|record| record["schema"] == "genos.mission-crossover-receipt/v1").count(), 1);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn crossover_requires_a_persisted_tick_and_registered_distinct_parents() {
    let missing_tick = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["biological", "--crossover-parent-a", "00000000-0000-4000-8000-000000000001"])
        .output().unwrap();
    assert!(!missing_tick.status.success());
    assert!(String::from_utf8_lossy(&missing_tick.stderr).contains("--tick"));

    let root = std::env::temp_dir().join(format!("genos-cli-crossover-refusal-{}", Uuid::new_v4()));
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let parent_a = Uuid::new_v4().to_string();
    let parent_b = Uuid::new_v4().to_string();
    let refused = invoke(&root, &[
        "biological", "--tick", "--mission-id", &mission_arg,
        "--mission", "reject unknown crossover parents", "--crossover-parent-a", &parent_a,
        "--crossover-parent-b", &parent_b, "--crossover-seed", "7",
    ]);
    assert!(!refused.status.success());
    assert!(String::from_utf8_lossy(&refused.stderr).contains("not active"));
    assert!(journal_records(&root, mission_id).iter()
        .all(|record| record["schema"] != "genos.mission-crossover-receipt/v1"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn crossover_replay_key_cannot_cross_mission_boundaries() {
    let root = std::env::temp_dir().join(format!("genos-cli-crossover-scope-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let source_mission = Uuid::new_v4();
    let source_arg = source_mission.to_string();
    let initial = invoke(&root, &[
        "biological", "--tick", "--divide", "--mission-id", &source_arg,
        "--mission", "crossover source mission",
    ]);
    assert!(initial.status.success(), "{}", String::from_utf8_lossy(&initial.stderr));
    let report: Value = serde_json::from_slice(&initial.stdout).unwrap();
    let division = report["receipts"].as_array().unwrap().iter()
        .find(|receipt| receipt["schema"] == "genos.cell-division-receipt/v1").unwrap();
    let parent_a = division["parent_cell_id"].as_str().unwrap();
    let parent_b = division["daughter_cell_id"].as_str().unwrap();
    let created = invoke(&root, &[
        "biological", "--tick", "--mission-id", &source_arg,
        "--mission", "crossover source mission", "--crossover-parent-a", parent_a,
        "--crossover-parent-b", parent_b, "--crossover-seed", "55",
    ]);
    assert!(created.status.success(), "{}", String::from_utf8_lossy(&created.stderr));
    let created_report: Value = serde_json::from_slice(&created.stdout).unwrap();
    let key = crossover_from(&created_report)["idempotency_key"].as_str().unwrap();
    let other_mission = Uuid::new_v4().to_string();
    let replay = invoke(&root, &[
        "biological", "--tick", "--mission-id", &other_mission,
        "--mission", "different crossover mission", "--replay-crossover-key", key,
    ]);
    assert!(!replay.status.success());
    assert!(String::from_utf8_lossy(&replay.stderr).contains("not found"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn missing_crossover_replay_refuses_without_advancing_the_mission() {
    let root = std::env::temp_dir().join(format!("genos-cli-crossover-missing-{}", Uuid::new_v4()));
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let replay = invoke(&root, &[
        "biological", "--tick", "--mission-id", &mission_arg,
        "--mission", "missing crossover replay", "--replay-crossover-key", "unknown-receipt",
    ]);
    assert!(!replay.status.success());
    assert!(String::from_utf8_lossy(&replay.stderr).contains("crossover receipt not found"));
    assert!(journal_records(&root, mission_id).is_empty(),
        "a missing replay must not persist a new mission tick");
    let _ = std::fs::remove_dir_all(root);
}

fn invoke(root: &std::path::Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(args).env("GENOS_STUDIO_ROOT", root).output().unwrap()
}

fn crossover_from(report: &Value) -> &Value {
    report["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["operation"] == "mission_meiotic_crossover")
        .expect("crossover operation receipt should be reported").get("receipt")
        .expect("crossover receipt should be present")
}

fn journal_records(root: &std::path::Path, mission_id: Uuid) -> Vec<Value> {
    let path = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    if !path.exists() { return Vec::new(); }
    std::fs::read_to_string(path).unwrap().lines()
        .flat_map(|line| {
            let batch: Value = serde_json::from_str(line).unwrap();
            batch["receipts"].as_array().unwrap().clone()
        }).collect()
}
