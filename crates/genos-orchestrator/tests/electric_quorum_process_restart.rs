use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::electric_quorum_runtime::{
    ElectricMissionVote, ElectricQuorumRequest, ElectricVoterAuthority,
};
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::collections::HashMap;
use std::process::Command;
use uuid::Uuid;

const TEST_EXPIRY_UNIX_MS: u64 = 4_000_000_000_000;

#[test]
fn accepted_signed_electric_quorum_restores_from_journal_in_child_process() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-electric-quorum-{nonce}.jsonl"));
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("electric-quorum-source");
    source.set_mission_id(mission);
    source.orchestrator.create_tissue("Voters", "Mission").unwrap();
    let participants = (0..3).map(|index| source.orchestrator.add_worker(
        "Voters", AgentCell::new(format!("voter-{index}"), "vote", "participant"),
    ).unwrap()).collect::<Vec<_>>();
    let request = make_request(mission, "process-restart-proposal", &participants);
    let authority = make_authority(&participants);
    let receipt = source.discharge_electric_under_quorum_durable(
        request,
        &BiologicalReceiptStore::open(&path),
        &authority,
    ).unwrap();
    assert_eq!(receipt["accepted"], true);
    drop(source);

    let participants_text = participants.iter().map(Uuid::to_string).collect::<Vec<_>>().join(",");
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "electric_quorum_replay_child", "--nocapture"])
        .env("GENOS_ELECTRIC_QUORUM_JOURNAL", &path)
        .env("GENOS_ELECTRIC_QUORUM_MISSION", mission.to_string())
        .env("GENOS_ELECTRIC_QUORUM_PARTICIPANTS", participants_text)
        .output().unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "child replay failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn electric_quorum_replay_child() {
    let Ok(path) = std::env::var("GENOS_ELECTRIC_QUORUM_JOURNAL") else { return; };
    let mission = std::env::var("GENOS_ELECTRIC_QUORUM_MISSION").unwrap().parse::<Uuid>().unwrap();
    let participant_ids = std::env::var("GENOS_ELECTRIC_QUORUM_PARTICIPANTS").unwrap()
        .split(',').map(|value| value.parse::<Uuid>().unwrap()).collect::<Vec<_>>();
    let request = make_request(mission, "process-restart-proposal", &participant_ids);
    let authority = make_authority(&participant_ids);
    let store = BiologicalReceiptStore::open(path);
    let idempotency_key = format!("{mission}:{}", request.proposal_id);
    let receipt = store.find_idempotent_receipt("genos.electric-quorum-receipt/v1", &idempotency_key)
        .unwrap().unwrap();
    let mut recovered = GenosEcosystem::new("electric-quorum-recovered");
    recovered.set_mission_id(mission);
    recovered.replay_electric_quorum(&request, receipt.clone(), &authority).unwrap();
    assert!(recovered.electric_organ.electrocytes.iter().all(|cell| cell.is_depolarized));
    assert_eq!(store.read_all().unwrap().len(), 1);
    assert_eq!(receipt["accepted"], true);
}

fn make_request(mission: Uuid, proposal_id: &str, participants: &[Uuid]) -> ElectricQuorumRequest {
    let mut request = ElectricQuorumRequest {
        proposal_id: proposal_id.into(),
        expires_at_unix_ms: TEST_EXPIRY_UNIX_MS,
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

fn make_authority(participants: &[Uuid]) -> ElectricVoterAuthority {
    let keys = participants.iter().map(|id| {
        (*id, encode_hex(signing_key(*id).verifying_key().as_bytes()))
    }).collect::<HashMap<_, _>>();
    ElectricVoterAuthority::from_trusted_public_keys(keys).unwrap()
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
