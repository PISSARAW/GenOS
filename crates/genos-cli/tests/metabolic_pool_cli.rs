use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

struct CliRequest<'a> {
    mission: Uuid,
    cell: Uuid,
    workspace: &'a PathBuf,
    key: &'a str,
    amount: &'a str,
    experimental: bool,
}

fn scratch_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-metabolic-cli-{nonce}-{name}"))
}

fn invoke(request: CliRequest<'_>) -> std::process::Output {
    let mission = request.mission.to_string();
    let cell = request.cell.to_string();
    let mut command = Command::new(env!("CARGO_BIN_EXE_genos"));
    command.env("GENOS_STUDIO_ROOT", request.workspace)
        .args(["metabolic-pool", "--mission-id", mission.as_str(), "--cell-id", cell.as_str(),
            "--idempotency-key", request.key, "--operation", "mission.build", "--amino-acids", request.amount,
            "--tick", "6"]);
    if request.experimental { command.arg("--experimental"); }
    command.output().unwrap()
}

#[test]
fn durable_metabolic_pool_cli_restores_replays_and_refuses_conflicts() {
    let workspace = scratch_path("workspace");
    let journal_dir = workspace.join("biological-receipts");
    std::fs::create_dir_all(&journal_dir).unwrap();
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("metabolic-cli-fixture");
    source.set_mission_id(mission);
    let cell = source.orchestrator.orchestrator_id;
    source.orchestrator.active_cells.get_mut(&cell).unwrap().metabolism.amino_acids = 2.0;
    let journal = journal_dir.join(format!("{mission}.jsonl"));
    BiologicalReceiptStore::open(&journal).append_receipts(&[source.population_state_receipt(6).unwrap()]).unwrap();

    let request = |key, amount, experimental| CliRequest { mission, cell, workspace: &workspace, key, amount, experimental };
    let unauthorized = invoke(request("build-1", "2", false));
    assert!(!unauthorized.status.success());
    assert!(String::from_utf8_lossy(&unauthorized.stderr).contains("pass --experimental"));

    let first = invoke(request("build-1", "2", true));
    assert!(first.status.success(), "{}", String::from_utf8_lossy(&first.stderr));
    let first_receipt: serde_json::Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(first_receipt["mission_authority"], "unverified_cli_claim");
    assert_eq!(first_receipt["receipt"]["accepted"], true);
    assert_eq!(first_receipt["receipt"]["amino_acids_after"], 0.0);

    let replay = invoke(request("build-1", "2", true));
    assert!(replay.status.success(), "{}", String::from_utf8_lossy(&replay.stderr));
    assert_eq!(serde_json::from_slice::<serde_json::Value>(&replay.stdout).unwrap(), first_receipt);

    let conflict = invoke(request("build-1", "1", true));
    assert!(!conflict.status.success());
    assert!(String::from_utf8_lossy(&conflict.stderr).contains("conflicts with this operation"));

    let refusal = invoke(request("build-2", "3", true));
    assert!(refusal.status.success(), "{}", String::from_utf8_lossy(&refusal.stderr));
    let refusal_receipt: serde_json::Value = serde_json::from_slice(&refusal.stdout).unwrap();
    assert_eq!(refusal_receipt["receipt"]["accepted"], false);
    assert!(refusal_receipt["receipt"]["refusal_reason"].as_str().is_some());
    let stored = BiologicalReceiptStore::open(&journal).read_all().unwrap();
    assert_eq!(stored.len(), 3, "initial population, one debit, and one durable refusal");
    assert_eq!(stored[1]["active_cells"][0]["cell_state"]["metabolism"]["amino_acids"], 0.0);

    let _ = std::fs::remove_dir_all(workspace);
}
