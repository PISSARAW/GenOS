use ed25519_dalek::{Signer, SigningKey};
use genos_biology::{Plasmid, ProkaryoticAgent};
use genos_orchestrator::checkpoint::{CheckpointManager, OrchestratorCheckpointState};
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::hgt_runtime::{HgtLeaseRequest, HgtTransferContext, plasmid_digest};
use genos_orchestrator::GenosEcosystem;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tempfile::tempdir_in;
use uuid::Uuid;

fn donor() -> ProkaryoticAgent {
    ProkaryoticAgent::new("persisted-hgt-donor").with_plasmid(Plasmid {
        plasmid_id: "p-persisted".into(),
        skill_name: "SAFE_SKILL".into(),
        executable_payload: "data-only".into(),
        resistance_marker: "marker".into(),
        copy_number: 1,
    })
}

#[test]
fn mission_checkpoint_restores_hgt_donor_and_plasmids_after_manager_restart() {
    let dir = tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("hgt-checkpoint-source");
    source.set_mission_id(mission);
    source.prokaryote = donor();
    let state = OrchestratorCheckpointState::from_ecosystem(&source).unwrap();

    let mut manager = CheckpointManager::new(dir.path(), 1).unwrap();
    manager.create_checkpoint(&state).unwrap();
    drop(manager);

    let restarted_manager = CheckpointManager::new(dir.path(), 1).unwrap();
    let checkpoint = restarted_manager.load_latest_checkpoint().unwrap().unwrap();
    let restored_state: OrchestratorCheckpointState =
        serde_json::from_value(checkpoint.orchestrator_state).unwrap();
    let mut restored = GenosEcosystem::new("hgt-checkpoint-restored");
    restored.set_mission_id(mission);
    assert!(restored_state.apply_to_ecosystem(&mut restored).unwrap());
    assert_eq!(restored.prokaryote.id, "persisted-hgt-donor");
    assert_eq!(restored.prokaryote.plasmids, donor().plasmids);
}

#[test]
fn altered_or_cross_mission_hgt_checkpoint_refuses_before_ecosystem_mutation() {
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("hgt-checkpoint-source");
    source.set_mission_id(mission);
    source.prokaryote = donor();
    let state = OrchestratorCheckpointState::from_ecosystem(&source).unwrap();

    let mut altered = state.clone();
    altered.prokaryote.as_mut().unwrap().donor.plasmids[0].executable_payload = "changed".into();
    let mut target = GenosEcosystem::new("hgt-checkpoint-target");
    target.set_mission_id(mission);
    assert!(altered.apply_to_ecosystem(&mut target).unwrap_err().contains("digest"));
    assert_eq!(target.prokaryote.id, "orchestrator_donor");

    target.set_mission_id(Uuid::new_v4());
    assert!(state.apply_to_ecosystem(&mut target).unwrap_err().contains("identity"));
    assert_eq!(target.prokaryote.id, "orchestrator_donor");
}

#[test]
fn restored_checkpoint_donor_can_transfer_under_host_pinned_lease_and_replay_receipt() {
    let dir = tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
    let mission = Uuid::new_v4();
    let issuer = SigningKey::from_bytes(&[29; 32]);
    let plasmid = donor().plasmids[0].clone();
    let mut source = GenosEcosystem::new("hgt-checkpoint-source");
    source.set_mission_id(mission);
    source.prokaryote = donor();
    let state = OrchestratorCheckpointState::from_ecosystem(&source).unwrap();
    let mut manager = CheckpointManager::new(dir.path(), 1).unwrap();
    manager.create_checkpoint(&state).unwrap();
    drop(manager);

    let restarted_manager = CheckpointManager::new(dir.path(), 1).unwrap();
    let checkpoint = restarted_manager.load_latest_checkpoint().unwrap().unwrap();
    let state: OrchestratorCheckpointState =
        serde_json::from_value(checkpoint.orchestrator_state).unwrap();
    let journal = dir.path().join("hgt-receipts.jsonl");
    let request = HgtLeaseRequest {
        lease_id: "checkpoint-lease".into(),
        issuer_id: "host-pinned-test-issuer".into(),
        mission_id: mission,
        donor_id: "persisted-hgt-donor".into(),
        recipient_id: "checkpoint-recipient".into(),
        plasmid_id: plasmid.plasmid_id.clone(),
        plasmid_digest: plasmid_digest(&plasmid).unwrap(),
        nonce: "checkpoint-nonce".into(),
        expires_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
            + 60_000,
    };
    let signature = hex(&issuer.sign(&request.signing_bytes().unwrap()).to_bytes());
    let pinned_issuers = HashMap::from([(
        "host-pinned-test-issuer".to_string(),
        hex(issuer.verifying_key().as_bytes()),
    )]);

    let mut restored = GenosEcosystem::new("hgt-checkpoint-transfer");
    restored.set_mission_id(mission);
    assert!(state.apply_to_ecosystem(&mut restored).unwrap());
    assert_eq!(restored.prokaryote.id, "persisted-hgt-donor");
    assert_eq!(restored.prokaryote.plasmids, vec![plasmid.clone()]);
    restored.configure_hgt_trust(pinned_issuers.clone(), &journal).unwrap();
    let mut lease = restored.verify_hgt_lease(request.clone(), &signature).unwrap();
    let mut recipient = ProkaryoticAgent::new("checkpoint-recipient");
    let report = restored.hgt_transfer_under_lease(HgtTransferContext {
        recipient: &mut recipient,
        lease: &mut lease,
    }).unwrap();
    assert!(report.horizontal_transfer_success);
    assert_eq!(recipient.plasmids, vec![plasmid.clone()]);
    assert_eq!(BiologicalReceiptStore::open(&journal).read_all().unwrap().len(), 1);
    assert!(journal.with_extension("hgt.lock").exists());

    let mut replayed = GenosEcosystem::new("hgt-checkpoint-replay");
    replayed.set_mission_id(mission);
    assert!(state.apply_to_ecosystem(&mut replayed).unwrap());
    replayed.configure_hgt_trust(pinned_issuers, &journal).unwrap();
    let mut replay_lease = replayed.resume_hgt_lease(request, &signature).unwrap();
    let mut replay_recipient = ProkaryoticAgent::new("checkpoint-recipient");
    replayed.hgt_transfer_under_lease(HgtTransferContext {
        recipient: &mut replay_recipient,
        lease: &mut replay_lease,
    }).unwrap();
    assert_eq!(replay_recipient.plasmids, vec![plasmid]);
    assert_eq!(BiologicalReceiptStore::open(&journal).read_all().unwrap().len(), 1);
    assert!(journal.with_extension("hgt.lock").exists());
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
