use super::*;
use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::electric_quorum_runtime::ElectricMissionVote;
use genos_orchestrator::genos_cell::AgentCell;
use std::path::Path;

const EXPIRY: u64 = 4_000_000_000_000;

#[test]
fn signed_cli_quorum_is_idempotent_and_conflicts_fail_closed() {
    let directory = test_directory();
    let root = directory.path();
    let mission = Uuid::new_v4();
    let participants = seed_population(root, mission);
    let request = signed_request(mission, "cli-replay", &participants);
    let request_path = write_inputs(root, &request, &participants);
    write_host_trust(root, &participants);

    execute_in_workspace(command(mission, &request_path), root).unwrap();
    execute_in_workspace(command(mission, &request_path), root).unwrap();
    let store = journal(root, mission);
    assert_eq!(electric_receipt_count(&store), 1);

    let mut conflict = signed_request(mission, "cli-replay", &participants);
    conflict.votes[0].approve = false;
    let mut changed_vote = conflict.votes[0].clone();
    sign_vote(mission, &mut changed_vote, &conflict);
    conflict.votes[0] = changed_vote;
    let conflict_path = write_inputs(root, &conflict, &participants);
    assert!(execute_in_workspace(command(mission, &conflict_path), root).is_err());
    assert_eq!(electric_receipt_count(&store), 1);
}

#[test]
fn cli_requires_opt_in_and_explicit_trust_for_votes() {
    let directory = test_directory();
    let root = directory.path();
    let mission = Uuid::new_v4();
    let participants = seed_population(root, mission);
    let request = signed_request(mission, "cli-refusal", &participants);
    let request_path = write_inputs(root, &request, &[]);
    write_host_trust(root, &[]);

    assert!(execute(ElectricQuorumCmd {
        experimental: false,
        ..command(mission, &request_path)
    }).is_err());
    assert!(execute_in_workspace(command(mission, &request_path), root).is_err());
    assert_eq!(electric_receipt_count(&journal(root, mission)), 0);
}

#[test]
fn host_bootstrap_trust_cannot_be_replaced_by_a_caller_file() {
    let directory = test_directory();
    let root = directory.path();
    let mission = Uuid::new_v4();
    let participants = seed_population(root, mission);
    let request = signed_request(mission, "caller-file-ignored", &participants);
    let request_path = write_inputs(root, &request, &[]);
    write_host_trust(root, &[]);
    let caller_file = root.join("caller-trust.json");
    std::fs::write(&caller_file, trust_json(&participants)).unwrap();

    let error = execute_in_workspace(command(mission, &request_path), root).unwrap_err();
    assert!(error.contains("aucune clé de votant électrocytaire approuvée"));
    assert_eq!(electric_receipt_count(&journal(root, mission)), 0);
}

#[test]
fn host_bootstrap_trust_registry_symlink_is_refused() {
    let directory = test_directory();
    let workspace = directory.path().join("workspace");
    std::fs::create_dir_all(workspace.join("config")).unwrap();
    let mission = Uuid::new_v4();
    let participants = seed_population(&workspace, mission);
    let request = signed_request(mission, "symlink-trust-rejected", &participants);
    let request_path = write_inputs(&workspace, &request, &[]);
    let config_path = workspace.join("config/electric-voter-trust.json");
    let external_path = directory.path().join("external-trust.json");
    std::fs::write(&external_path, trust_json(&participants)).unwrap();
    std::fs::remove_file(&config_path).unwrap();
    if !link_external_file(&external_path, &config_path) {
        return;
    }

    let error = execute_in_workspace(command(mission, &request_path), &workspace).unwrap_err();
    assert!(error.contains("regular file"));
    assert_eq!(electric_receipt_count(&journal(&workspace, mission)), 0);
}

#[cfg(unix)]
fn link_external_file(source: &Path, destination: &Path) -> bool {
    std::os::unix::fs::symlink(source, destination).is_ok()
}

#[cfg(windows)]
fn link_external_file(source: &Path, destination: &Path) -> bool {
    std::os::windows::fs::symlink_file(source, destination).is_ok()
}

fn command(mission: Uuid, request: &Path) -> ElectricQuorumCmd {
    ElectricQuorumCmd {
        mission_id: mission,
        tick: 0,
        request: request.to_path_buf(),
        experimental: true,
    }
}

fn test_directory() -> tempfile::TempDir {
    let base = cargo_target_directory();
    std::fs::create_dir_all(&base).unwrap();
    tempfile::Builder::new()
        .prefix("electric-quorum-cli-")
        .tempdir_in(base)
        .unwrap()
}

fn cargo_target_directory() -> PathBuf {
    std::env::var_os("CARGO_TARGET_DIR").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target"))
}

fn seed_population(root: &Path, mission: Uuid) -> Vec<Uuid> {
    let directory = root.join("biological-receipts");
    std::fs::create_dir_all(&directory).unwrap();
    let mut ecosystem = GenosEcosystem::new("electric-quorum-cli-test");
    ecosystem.set_mission_id(mission);
    ecosystem.orchestrator.create_tissue("Voters", "Mission").unwrap();
    let ids = (0..3).map(|index| ecosystem.orchestrator.add_worker(
        "Voters", AgentCell::new(format!("voter-{index}"), "vote", "participant"),
    ).unwrap()).collect::<Vec<_>>();
    let snapshot = ecosystem.population_state_receipt(0).unwrap();
    journal(root, mission).append_receipts(&[snapshot]).unwrap();
    ids
}

fn signed_request(mission: Uuid, proposal: &str, ids: &[Uuid]) -> ElectricQuorumRequest {
    let mut request = ElectricQuorumRequest {
        proposal_id: proposal.into(),
        expires_at_unix_ms: EXPIRY,
        votes: ids.iter().map(|participant_cell_id| ElectricMissionVote {
            participant_cell_id: *participant_cell_id,
            approve: true,
            signature_hex: String::new(),
        }).collect(),
    };
    for index in 0..request.votes.len() {
        let mut vote = request.votes[index].clone();
        sign_vote(mission, &mut vote, &request);
        request.votes[index] = vote;
    }
    request
}

fn sign_vote(mission: Uuid, vote: &mut ElectricMissionVote, request: &ElectricQuorumRequest) {
    let claims = request.vote_signing_bytes(mission, vote).unwrap();
    vote.signature_hex = encode_hex(&signing_key(vote.participant_cell_id).sign(&claims).to_bytes());
}

fn write_inputs(root: &Path, request: &ElectricQuorumRequest, trusted_ids: &[Uuid]) -> PathBuf {
    let request_path = root.join("request.json");
    std::fs::write(&request_path, serde_json::to_vec(request).unwrap()).unwrap();
    write_host_trust(root, trusted_ids);
    request_path
}

fn write_host_trust(root: &Path, trusted_ids: &[Uuid]) {
    let directory = root.join("config");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(directory.join("electric-voter-trust.json"), trust_json(trusted_ids)).unwrap();
}

fn trust_json(trusted_ids: &[Uuid]) -> Vec<u8> {
    let voters = trusted_ids.iter().map(|id| serde_json::json!({
        "cell_id": id,
        "public_key_hex": encode_hex(signing_key(*id).verifying_key().as_bytes()),
    })).collect::<Vec<_>>();
    serde_json::to_vec(&serde_json::json!({
        "schema": "genos.electric-voter-trust/v1",
        "voters": voters,
    })).unwrap()
}

fn journal(root: &Path, mission: Uuid) -> BiologicalReceiptStore {
    BiologicalReceiptStore::open(root.join("biological-receipts").join(format!("{mission}.jsonl")))
}

fn electric_receipt_count(store: &BiologicalReceiptStore) -> usize {
    store.read_all().unwrap().iter()
        .filter(|receipt| receipt["schema"] == "genos.electric-quorum-receipt/v1").count()
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
