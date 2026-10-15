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
    let (request_path, keys_path) = write_inputs(root, &request, &participants);

    execute_in_workspace(command(mission, &request_path, &keys_path), root).unwrap();
    execute_in_workspace(command(mission, &request_path, &keys_path), root).unwrap();
    let store = journal(root, mission);
    assert_eq!(electric_receipt_count(&store), 1);

    let mut conflict = signed_request(mission, "cli-replay", &participants);
    conflict.votes[0].approve = false;
    let mut changed_vote = conflict.votes[0].clone();
    sign_vote(mission, &mut changed_vote, &conflict);
    conflict.votes[0] = changed_vote;
    let (conflict_path, _) = write_inputs(root, &conflict, &participants);
    assert!(execute_in_workspace(command(mission, &conflict_path, &keys_path), root).is_err());
    assert_eq!(electric_receipt_count(&store), 1);
}

#[test]
fn cli_requires_opt_in_and_explicit_trust_for_votes() {
    let directory = test_directory();
    let root = directory.path();
    let mission = Uuid::new_v4();
    let participants = seed_population(root, mission);
    let request = signed_request(mission, "cli-refusal", &participants);
    let (request_path, keys_path) = write_inputs(root, &request, &[]);

    assert!(execute(ElectricQuorumCmd {
        experimental: false,
        ..command(mission, &request_path, &keys_path)
    }).is_err());
    assert!(execute_in_workspace(command(mission, &request_path, &keys_path), root).is_err());
    assert_eq!(electric_receipt_count(&journal(root, mission)), 0);
}

fn command(mission: Uuid, request: &Path, trusted_keys: &Path) -> ElectricQuorumCmd {
    ElectricQuorumCmd {
        mission_id: mission,
        tick: 0,
        request: request.to_path_buf(),
        trusted_keys: trusted_keys.to_path_buf(),
        experimental: true,
    }
}

fn test_directory() -> tempfile::TempDir {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
    tempfile::Builder::new()
        .prefix("electric-quorum-cli-")
        .tempdir_in(base)
        .unwrap()
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

fn write_inputs(
    root: &Path,
    request: &ElectricQuorumRequest,
    trusted_ids: &[Uuid],
) -> (PathBuf, PathBuf) {
    let request_path = root.join("request.json");
    std::fs::write(&request_path, serde_json::to_vec(request).unwrap()).unwrap();
    let voters = trusted_ids.iter().map(|id| serde_json::json!({
        "cell_id": id,
        "public_key_hex": encode_hex(signing_key(*id).verifying_key().as_bytes()),
    })).collect::<Vec<_>>();
    let keys_path = root.join("trusted-keys.json");
    std::fs::write(&keys_path, serde_json::to_vec(&serde_json::json!({
        "schema": "genos.electric-voter-trust/v1",
        "voters": voters,
    })).unwrap()).unwrap();
    (request_path, keys_path)
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
