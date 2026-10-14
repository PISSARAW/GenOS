use genos_dna::{codec, compile, manifest::Manifest};
use serde_json::json;
use sha2::Digest;
use std::process::Command;
use uuid::Uuid;

#[test]
fn biological_command_persists_dna_recruitment_under_the_requested_mission() {
    let root = std::env::temp_dir().join(format!("genos-cli-epigenetic-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let dna_path = root.join("candidate.dna");
    let spec_path = root.join("recruitment.json");
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let dna = candidate_dna();
    std::fs::write(&dna_path, codec::encode(&dna).unwrap()).unwrap();
    std::fs::write(&spec_path, json!({
        "tissue": "Archive",
        "roles": ["historian"],
        "capabilities": [],
        "budget": 10.0,
        "candidate_cost": 1.0,
    }).to_string()).unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &mission_arg,
            "--mission", "persisted epigenetic recruitment", "--recruit-dna",
            dna_path.to_str().unwrap(), "--recruitment-spec", spec_path.to_str().unwrap(),
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(response["operation"], "biological_mission_tick");
    assert!(response["receipts"].as_array().unwrap().iter().any(|entry| {
        entry["operation"] == "epigenetic_dna_recruitment"
            && entry["decision"]["feasible"] == true
    }));
    let journal = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    let batches: Vec<serde_json::Value> = std::fs::read_to_string(journal).unwrap()
        .lines().map(|line| serde_json::from_str(line).unwrap()).collect();
    assert!(batches.iter().flat_map(|batch| batch["receipts"].as_array().unwrap()).any(|record| {
        record["schema"] == "genos.epigenetic-recruitment-receipt/v1"
            && record["mission_id"] == mission_id.to_string()
            && record["expressions"].as_array().is_some_and(|items| items.len() == 1)
    }));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn biological_command_refuses_recruitment_without_a_persisted_tick() {
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["biological", "--recruit-dna", "missing.dna", "--recruitment-spec", "missing.json"])
        .output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("require --tick"));
}

#[test]
fn biological_command_refuses_division_without_a_persisted_tick() {
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["biological", "--divide"])
        .output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("--tick"));
}

#[test]
fn biological_command_persists_reproduction_lineage_under_the_requested_mission() {
    let root = std::env::temp_dir().join(format!("genos-cli-reproduction-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--reproduce", "--mission-id", &mission_arg,
            "--mission", "persisted genome reproduction",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    let reproduction = response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == "genos.reproduction-lineage-receipt/v1")
        .expect("reproduction lineage receipt should be reported");
    let journal = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    let batches: Vec<serde_json::Value> = std::fs::read_to_string(journal).unwrap()
        .lines().map(|line| serde_json::from_str(line).unwrap()).collect();
    let records: Vec<&serde_json::Value> = batches.iter()
        .flat_map(|batch| batch["receipts"].as_array().unwrap()).collect();
    let link_index = records.iter().position(|entry| entry["schema"] == "genos.reproduction-lineage-recovery/v1"
            && entry["idempotency_key"] == reproduction["idempotency_key"])
        .expect("matching reproduction recovery link should be durable");
    let link = records[link_index];
    let snapshot = records[..link_index].iter().rev()
        .find(|entry| entry["schema"] == "genos.population-state/v1"
            && entry["mission_id"] == mission_id.to_string()
            && entry["tick"] == link["tick"])
        .expect("linked population snapshot should be durable");
    assert_eq!(reproduction["mission_id"], mission_id.to_string());
    assert_eq!(link["mission_id"], mission_id.to_string());
    assert_eq!(reproduction["population_snapshot_sha256"], link["population_snapshot_sha256"]);
    let cells = snapshot["active_cells"].as_array().expect("snapshot active cells");
    for cell in [&reproduction["parent_cell"], &reproduction["daughter_cell"]] {
        assert!(cells.iter().any(|entry| entry["cell_id"] == cell["cell_id"]),
            "snapshot missing cell {}; available {:?}", cell["cell_id"],
            cells.iter().map(|entry| &entry["cell_id"]).collect::<Vec<_>>());
    }
    let snapshot_bytes = serde_json::to_vec(snapshot).unwrap();
    let snapshot_digest = format!("{:x}", sha2::Sha256::digest(snapshot_bytes));
    assert_eq!(snapshot_digest, link["population_snapshot_sha256"]);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn biological_division_command_persists_recovery_snapshot_and_link() {
    let root = std::env::temp_dir().join(format!("genos-cli-division-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--divide", "--mission-id", &mission_arg,
            "--mission", "persisted division recovery",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    let division = response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == "genos.cell-division-receipt/v1")
        .expect("division receipt should be reported");
    let journal = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    let batches: Vec<serde_json::Value> = std::fs::read_to_string(journal).unwrap()
        .lines().map(|line| serde_json::from_str(line).unwrap()).collect();
    let records: Vec<&serde_json::Value> = batches.iter()
        .flat_map(|batch| batch["receipts"].as_array().unwrap()).collect();
    let link_index = records.iter().position(|entry| entry["schema"] == "genos.cell-division-recovery/v1")
        .expect("division recovery link should be durable");
    let link = records[link_index];
    let snapshot = records[..link_index].iter().rev()
        .find(|entry| entry["schema"] == "genos.population-state/v1"
            && entry["tick"] == link["tick"])
        .expect("the linked population snapshot should be durable");
    assert_eq!(link["mission_id"], mission_id.to_string());
    assert_eq!(link["division_receipt_id"], division["receipt_id"]);
    assert_eq!(snapshot["mission_id"], mission_id.to_string());
    for cell_id in [&division["parent_cell_id"], &division["daughter_cell_id"]] {
        assert!(snapshot["active_cells"].as_array().unwrap().iter()
            .any(|cell| cell["cell_id"] == *cell_id), "division cell {cell_id} missing from linked snapshot");
    }
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn failed_later_operation_checkpoints_prior_durable_division_for_retry() {
    let root = std::env::temp_dir().join(format!("genos-cli-partial-ops-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let mission_id = Uuid::new_v4();
    let mission_arg = mission_id.to_string();
    let stream_path = root.join("invalid-stream.json");
    std::fs::write(&stream_path, "{").unwrap();
    let first = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--divide", "--choanocyte-stream",
            stream_path.to_str().unwrap(), "--mission-id", &mission_arg,
            "--mission", "resume partial durable operation",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output().unwrap();
    assert!(!first.status.success(), "invalid stream should fail after division");

    let checkpoint = root.join("biological-receipts").join(format!("{mission_id}.continuity"));
    assert!(checkpoint.join("orchestration.head.json").exists(),
        "durable division must checkpoint state before reporting the later failure");
    let retry = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &mission_arg,
            "--mission", "resume partial durable operation",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output().unwrap();
    assert!(retry.status.success(), "{}", String::from_utf8_lossy(&retry.stderr));
    let response: serde_json::Value = serde_json::from_slice(&retry.stdout).unwrap();
    assert_eq!(response["tick"], 2, "retry should continue from the checkpointed tick");
    let _ = std::fs::remove_dir_all(root);
}

fn candidate_dna() -> genos_dna::AgentDna {
    let manifest: Manifest = serde_json::from_str(r#"{
        "apiVersion":"v0alpha1",
        "kind":"AgentGenome",
        "metadata":{"name":"ArchiveCandidate","version":"0.1.0"},
        "identity":{"role":"historian","name":"ArchiveCandidate","name_meaning":"archive"},
        "objectives":{"primary":"archive evidence","source_doc":"docs/README.md"},
        "capabilities":[],
        "tool_policy":{"allowed_tools":[]}
    }"#).unwrap();
    compile::compile_manifest(&manifest).unwrap()
}
