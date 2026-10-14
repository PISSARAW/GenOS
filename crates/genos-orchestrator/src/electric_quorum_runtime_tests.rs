use super::*;
use crate::genos_cell::AgentCell;
use ed25519_dalek::{Signer, SigningKey};
use genos_biology::specialized_cells::electrocyte::ElectricOrganStack;

fn signing_key(cell_id: Uuid) -> SigningKey {
    let mut seed = [0; 32];
    seed[..16].copy_from_slice(cell_id.as_bytes());
    seed[16..].copy_from_slice(cell_id.as_bytes());
    SigningKey::from_bytes(&seed)
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn quorum_fixture() -> (GenosEcosystem, Vec<Uuid>, ElectricVoterAuthority) {
    let mut eco = GenosEcosystem::new("electro-quorum");
    eco.set_mission_id(Uuid::new_v4());
    eco.orchestrator.create_tissue("Participants", "Mission").unwrap();
    for index in 0..3 {
        eco.orchestrator.add_worker(
            "Participants",
            AgentCell::new(format!("participant-{index}"), "test", "worker"),
        ).unwrap();
    }
    eco.electric_organ = ElectricOrganStack::new("measured-organ", 6000, 2);
    let ids = eco.orchestrator.active_cells.keys().copied().take(3).collect::<Vec<_>>();
    let keys = ids.iter().map(|id| (*id, encode_hex(signing_key(*id).verifying_key().as_bytes())))
        .collect();
    let authority = ElectricVoterAuthority::from_trusted_public_keys(keys).unwrap();
    (eco, ids, authority)
}

fn signed_request(mission_id: Uuid, proposal: &str, ids: &[Uuid]) -> ElectricQuorumRequest {
    let mut request = ElectricQuorumRequest {
        proposal_id: proposal.into(),
        expires_at_unix_ms: now_unix_ms() + 10_000,
        votes: ids.iter().map(|participant_cell_id| ElectricMissionVote {
            participant_cell_id: *participant_cell_id,
            approve: true,
            signature_hex: String::new(),
        }).collect(),
    };
    for index in 0..request.votes.len() {
        let vote = request.votes[index].clone();
        let bytes = request.vote_signing_bytes(mission_id, &vote).unwrap();
        request.votes[index].signature_hex = encode_hex(
            &signing_key(vote.participant_cell_id).sign(&bytes).to_bytes(),
        );
    }
    request
}

fn organ_snapshot(organ: &ElectricOrganStack) -> Value {
    serde_json::to_value(&organ.electrocytes).unwrap()
}

#[test]
fn authenticated_durable_quorum_appends_before_mutation_and_replays() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("electric-quorum.jsonl");
    let store = BiologicalReceiptStore::open(&path);
    let (mut ecosystem, ids, authority) = quorum_fixture();
    let mission_id = ecosystem.mission_id.unwrap();
    let request = signed_request(mission_id, "signed-discharge-1", &ids);
    let original = ecosystem.electric_organ.clone();

    let receipt = ecosystem.discharge_electric_under_quorum_durable(
        request.clone(), &store, &authority,
    ).unwrap();
    assert_eq!(receipt["accepted"], true);
    assert_eq!(store.read_all().unwrap().len(), 1);
    assert!(ecosystem.electric_organ.electrocytes.iter().any(|cell| cell.is_depolarized));
    assert_ne!(organ_snapshot(&ecosystem.electric_organ), organ_snapshot(&original));

    let reopened = BiologicalReceiptStore::open(&path);
    let durable = reopened.find_idempotent_receipt(
        DURABLE_QUORUM_SCHEMA, &format!("{mission_id}:{}", request.proposal_id),
    ).unwrap().unwrap();
    let mut restored = GenosEcosystem::new("electro-quorum-restart");
    restored.set_mission_id(mission_id);
    restored.electric_organ = original;
    let replayed = restored.replay_electric_quorum(&request, durable, &authority).unwrap();
    assert_eq!(replayed, receipt);
    assert_eq!(organ_snapshot(&restored.electric_organ), organ_snapshot(&ecosystem.electric_organ));
    assert_eq!(reopened.read_all().unwrap().len(), 1);
}

#[test]
fn altered_or_unknown_identity_votes_are_refused_without_persisting_or_mutating() {
    let directory = tempfile::tempdir().unwrap();
    let store = BiologicalReceiptStore::open(directory.path().join("electric-quorum.jsonl"));
    let (mut ecosystem, ids, authority) = quorum_fixture();
    let mission_id = ecosystem.mission_id.unwrap();
    let original = organ_snapshot(&ecosystem.electric_organ);
    let mut altered = signed_request(mission_id, "altered-vote", &ids);
    altered.votes[0].approve = false;
    assert!(ecosystem.discharge_electric_under_quorum_durable(
        altered, &store, &authority,
    ).is_err());

    let mut changed_scope = signed_request(mission_id, "scope-binding", &ids);
    changed_scope.proposal_id.push_str("-changed");
    assert!(ecosystem.discharge_electric_under_quorum_durable(
        changed_scope, &store, &authority,
    ).is_err());

    let unknown_id = Uuid::new_v4();
    let unknown = signed_request(mission_id, "unknown-voter", &[ids[0], ids[1], unknown_id]);
    assert!(ecosystem.discharge_electric_under_quorum_durable(
        unknown, &store, &authority,
    ).is_err());
    assert!(store.read_all().unwrap().is_empty());
    assert_eq!(organ_snapshot(&ecosystem.electric_organ), original);
}

#[test]
fn voter_authority_rejects_missing_or_malformed_trust_configuration() {
    let empty = std::collections::HashMap::new();
    assert!(ElectricVoterAuthority::from_trusted_public_keys(empty).is_err());
    let malformed = std::collections::HashMap::from([
        (Uuid::new_v4(), "not-a-public-key".to_string()),
    ]);
    assert!(ElectricVoterAuthority::from_trusted_public_keys(malformed).is_err());
}

#[test]
fn duplicate_votes_and_expired_requests_are_refused() {
    let directory = tempfile::tempdir().unwrap();
    let store = BiologicalReceiptStore::open(directory.path().join("electric-quorum.jsonl"));
    let (mut ecosystem, ids, authority) = quorum_fixture();
    let mission_id = ecosystem.mission_id.unwrap();
    let mut duplicate = signed_request(mission_id, "duplicate-voter", &[ids[0], ids[0], ids[1]]);
    duplicate.votes[1].signature_hex = duplicate.votes[0].signature_hex.clone();
    assert!(ecosystem.discharge_electric_under_quorum_durable(
        duplicate, &store, &authority,
    ).is_err());

    let mut expired = signed_request(mission_id, "expired-vote", &ids);
    expired.expires_at_unix_ms = 0;
    assert!(ecosystem.discharge_electric_under_quorum_durable(
        expired, &store, &authority,
    ).is_err());
    assert!(store.read_all().unwrap().is_empty());
}

#[test]
fn conflicting_signed_votes_cannot_replace_an_idempotent_receipt() {
    let directory = tempfile::tempdir().unwrap();
    let store = BiologicalReceiptStore::open(directory.path().join("electric-quorum.jsonl"));
    let (mut ecosystem, ids, authority) = quorum_fixture();
    let mission_id = ecosystem.mission_id.unwrap();
    let first = signed_request(mission_id, "same-proposal", &ids);
    ecosystem.discharge_electric_under_quorum_durable(
        first, &store, &authority,
    ).unwrap();
    let mut conflicting = signed_request(mission_id, "same-proposal", &ids);
    conflicting.votes[0].approve = false;
    let signed = conflicting.vote_signing_bytes(mission_id, &conflicting.votes[0]).unwrap();
    conflicting.votes[0].signature_hex = encode_hex(
        &signing_key(conflicting.votes[0].participant_cell_id).sign(&signed).to_bytes(),
    );
    assert!(ecosystem.discharge_electric_under_quorum_durable(
        conflicting, &store, &authority,
    ).is_err());
    assert_eq!(store.read_all().unwrap().len(), 1);
}
