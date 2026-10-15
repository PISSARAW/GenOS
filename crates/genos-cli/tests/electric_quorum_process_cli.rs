use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::electric_quorum_runtime::{ElectricMissionVote, ElectricQuorumRequest};
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::path::PathBuf;
use std::process::Command;
use uuid::Uuid;

const EXPIRY: u64 = 4_000_000_000_000;

struct CliFixture {
    workspace: tempfile::TempDir,
    mission: Uuid,
    request: PathBuf,
}

#[test]
fn electric_quorum_replays_across_separate_cli_processes() {
    let fixture = fixture();
    let first = run_cli(&fixture);
    assert!(first.status.success(), "{}", String::from_utf8_lossy(&first.stderr));
    let response: serde_json::Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(response["quorum_kind"], "local_software_quorum");
    assert_eq!(response["trusted_keys_source"], "host_bootstrap_workspace_config");
    assert_eq!(response["workspace_root_binding"], "not_authenticated_for_direct_cli");
    assert_eq!(response["distributed_consensus"], false);
    assert_eq!(response["receipt"]["accepted"], true);

    let retry = run_cli(&fixture);
    assert!(retry.status.success(), "{}", String::from_utf8_lossy(&retry.stderr));
    let path = fixture.workspace.path().join("biological-receipts")
        .join(format!("{}.jsonl", fixture.mission));
    let records = BiologicalReceiptStore::open(path).read_all().unwrap();
    assert_eq!(records.iter()
        .filter(|receipt| receipt["schema"] == "genos.electric-quorum-receipt/v1").count(), 1);
}

fn fixture() -> CliFixture {
    let workspace = test_directory();
    std::fs::create_dir_all(workspace.path().join("biological-receipts")).unwrap();
    let mission = Uuid::new_v4();
    let mut ecosystem = GenosEcosystem::new("electric-quorum-cli-process-test");
    ecosystem.set_mission_id(mission);
    ecosystem.orchestrator.create_tissue("Voters", "Mission").unwrap();
    let participants = (0..3).map(|index| ecosystem.orchestrator.add_worker(
        "Voters", AgentCell::new(format!("voter-{index}"), "vote", "participant"),
    ).unwrap()).collect::<Vec<_>>();
    let snapshot = ecosystem.population_state_receipt(0).unwrap();
    let journal = BiologicalReceiptStore::open(workspace.path().join("biological-receipts")
        .join(format!("{mission}.jsonl")));
    journal.append_receipts(&[snapshot]).unwrap();

    let request = signed_request(mission, "process-replay", &participants);
    let request_path = workspace.path().join("request.json");
    std::fs::write(&request_path, serde_json::to_vec(&request).unwrap()).unwrap();
    let voters = participants.iter().map(|id| serde_json::json!({
        "cell_id": id,
        "public_key_hex": encode_hex(signing_key(*id).verifying_key().as_bytes()),
    })).collect::<Vec<_>>();
    let config = workspace.path().join("config");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(config.join("electric-voter-trust.json"), serde_json::to_vec(&serde_json::json!({
        "schema": "genos.electric-voter-trust/v1",
        "voters": voters,
    })).unwrap()).unwrap();
    CliFixture { workspace, mission, request: request_path }
}

fn run_cli(fixture: &CliFixture) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "electric-quorum", "--mission-id", &fixture.mission.to_string(),
            "--tick", "0", "--request",
        ])
        .arg(&fixture.request)
        .arg("--experimental")
        .env("GENOS_STUDIO_ROOT", fixture.workspace.path())
        .output()
        .unwrap()
}

#[test]
fn electric_quorum_rejects_caller_selected_trust_registry() {
    let fixture = fixture();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "electric-quorum", "--mission-id", &fixture.mission.to_string(),
            "--tick", "0", "--request",
        ])
        .arg(&fixture.request)
        .arg("--trusted-keys")
        .arg(fixture.workspace.path().join("config/electric-voter-trust.json"))
        .arg("--experimental")
        .env("GENOS_STUDIO_ROOT", fixture.workspace.path())
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("unexpected argument"));
}

fn test_directory() -> tempfile::TempDir {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
    tempfile::Builder::new().prefix("electric-quorum-process-").tempdir_in(base).unwrap()
}

fn signed_request(mission: Uuid, proposal: &str, participants: &[Uuid]) -> ElectricQuorumRequest {
    let mut request = ElectricQuorumRequest {
        proposal_id: proposal.into(),
        expires_at_unix_ms: EXPIRY,
        votes: participants.iter().map(|participant_cell_id| ElectricMissionVote {
            participant_cell_id: *participant_cell_id,
            approve: true,
            signature_hex: String::new(),
        }).collect(),
    };
    for index in 0..request.votes.len() {
        let vote = request.votes[index].clone();
        let bytes = request.vote_signing_bytes(mission, &vote).unwrap();
        request.votes[index].signature_hex = encode_hex(
            &signing_key(vote.participant_cell_id).sign(&bytes).to_bytes(),
        );
    }
    request
}

fn signing_key(cell_id: Uuid) -> SigningKey {
    let mut seed = [0; 32];
    seed[..16].copy_from_slice(cell_id.as_bytes());
    seed[16..].copy_from_slice(cell_id.as_bytes());
    SigningKey::from_bytes(&seed)
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
