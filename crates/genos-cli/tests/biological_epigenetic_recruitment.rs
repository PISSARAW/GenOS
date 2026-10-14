use genos_dna::{codec, compile, manifest::Manifest};
use serde_json::json;
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
    assert!(String::from_utf8_lossy(&output.stderr).contains("requires --tick"));
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
