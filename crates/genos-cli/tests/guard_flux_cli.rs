use serde_json::Value;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

struct GuardArgs<'a> {
    mission: Uuid,
    cell_id: Option<Uuid>,
    tick: u64,
    flux: f64,
    key: &'a str,
    experimental: bool,
}

#[test]
fn accepted_guard_flux_replays_after_a_new_cli_process() {
    let workspace = scratch_workspace();
    let mission = Uuid::new_v4();
    let cell_id = seed_cell_snapshot(&workspace, mission);
    let args = GuardArgs { mission, cell_id: Some(cell_id), tick: 4, flux: 20.0, key: "guard-restart-key", experimental: true };
    let first = invoke(&workspace, &args);
    assert_success(&first);
    let initial: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(initial["execution_mode"], "experimental");
    assert_eq!(initial["mission_authority"], "unverified_cli_claim");
    assert_eq!(initial["receipt"]["accepted"], true);
    assert_eq!(initial["receipt"]["cell_id"], cell_id.to_string());
    assert!(initial["receipt"]["result"]["admitted_flux"].as_f64().unwrap() > 0.0);

    let replay = invoke(&workspace, &args);
    assert_success(&replay);
    let replayed: Value = serde_json::from_slice(&replay.stdout).unwrap();
    assert_eq!(replayed, initial);
    let journal = workspace.join("biological-receipts").join(format!("{mission}.jsonl"));
    let records = BiologicalReceiptStore::open(journal).read_all().unwrap();
    assert_eq!(records.iter().filter(|record| record["idempotency_key"] == args.key).count(), 1);
    let _ = std::fs::remove_dir_all(workspace);
}

#[test]
fn insufficient_atp_is_persisted_as_a_closed_flux_refusal() {
    let workspace = scratch_workspace();
    let mission = Uuid::new_v4();
    let output = invoke(&workspace, &GuardArgs { mission, cell_id: None, tick: 1, flux: 10_001.0, key: "guard-atp-refusal", experimental: true });
    assert_success(&output);
    let receipt: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(receipt["mission_authority"], "unverified_cli_claim");
    assert_eq!(receipt["receipt"]["accepted"], false);
    assert_eq!(receipt["receipt"]["refusal_reason"], "insufficient ATP energy reserve");
    assert_eq!(receipt["receipt"]["result"]["admitted_flux"], 0.0);
    assert_eq!(receipt["receipt"]["atp_cost"], 0.0);
    let _ = std::fs::remove_dir_all(workspace);
}

#[test]
fn guard_flux_requires_an_explicit_experimental_opt_in() {
    let workspace = scratch_workspace();
    let output = invoke(&workspace, &GuardArgs {
        mission: Uuid::new_v4(),
        cell_id: None,
        tick: 1,
        flux: 1.0,
        key: "guard-no-authority",
        experimental: false,
    });
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("pass --experimental to opt in"));
    assert!(!workspace.join("biological-receipts").exists());
    let _ = std::fs::remove_dir_all(workspace);
}

fn invoke(workspace: &PathBuf, args: &GuardArgs<'_>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_genos"));
    command
        .current_dir(workspace)
        .env("GENOS_STUDIO_ROOT", workspace)
        .args([
            "guard-flux",
            "--mission-id",
            &args.mission.to_string(),
        ]);
    if let Some(cell_id) = args.cell_id {
        command.args(["--cell-id", &cell_id.to_string()]);
    }
    command.args([
            "--tick",
            &args.tick.to_string(),
            "--requested-flux",
            &args.flux.to_string(),
            "--idempotency-key",
            args.key,
        ]);
    if args.experimental { command.arg("--experimental"); }
    command.output().unwrap()
}

fn seed_cell_snapshot(workspace: &PathBuf, mission: Uuid) -> Uuid {
    let journal_dir = workspace.join("biological-receipts");
    std::fs::create_dir_all(&journal_dir).unwrap();
    let mut ecosystem = GenosEcosystem::new("guard-flux-cli-fixture");
    ecosystem.set_mission_id(mission);
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    ecosystem.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 50.0;
    let journal = journal_dir.join(format!("{mission}.jsonl"));
    BiologicalReceiptStore::open(journal).append_receipts(&[ecosystem.population_state_receipt(4).unwrap()]).unwrap();
    cell_id
}

fn assert_success(output: &Output) {
    assert!(
        output.status.success(),
        "guard-flux failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn scratch_workspace() -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let workspace = std::env::temp_dir().join(format!("genos-guard-flux-cli-{nonce}"));
    std::fs::create_dir(&workspace).unwrap();
    workspace
}
