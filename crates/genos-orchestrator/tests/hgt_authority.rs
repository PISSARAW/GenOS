use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::genos_biology::{Plasmid, ProkaryoticAgent};
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::hgt_runtime::{
    HgtLeaseRequest, HgtTransferContext, plasmid_digest,
};
use std::collections::HashMap;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn request_for(mission_id: uuid::Uuid, plasmid: &Plasmid) -> HgtLeaseRequest {
    HgtLeaseRequest {
        lease_id: "lease-001".into(),
        issuer_id: "issuer-1".into(),
        mission_id,
        donor_id: "donor-1".into(),
        recipient_id: "recipient-1".into(),
        plasmid_id: plasmid.plasmid_id.clone(),
        plasmid_digest: plasmid_digest(plasmid).unwrap(),
        nonce: "nonce-001".into(),
        expires_at_unix_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() + 30_000,
    }
}

fn sign(request: &HgtLeaseRequest, issuer: &SigningKey) -> String {
    hex(&issuer.sign(&request.signing_bytes().unwrap()).to_bytes())
}

fn trusted_issuers(issuer: &SigningKey) -> HashMap<String, String> {
    HashMap::from([("issuer-1".to_string(), hex(issuer.verifying_key().as_bytes()))])
}

fn test_plasmid() -> Plasmid {
    Plasmid {
        plasmid_id: "p-runtime".into(),
        skill_name: "signal-filter".into(),
        executable_payload: "PAYLOAD_NOT_EXECUTED".into(),
        resistance_marker: "test".into(),
        copy_number: 1,
    }
}

#[test]
fn external_ed25519_lease_transfers_and_replays_from_durable_receipt() {
    let issuer = SigningKey::from_bytes(&[7; 32]);
    let mission_id = uuid::Uuid::new_v4();
    let plasmid = test_plasmid();
    let mut eco = GenosEcosystem::new("hgt-ed25519");
    eco.set_mission_id(mission_id);
    eco.prokaryote = ProkaryoticAgent::new("donor-1").with_plasmid(plasmid.clone());
    let path = std::env::temp_dir().join(format!("genos-hgt-{}.jsonl", uuid::Uuid::new_v4()));
    let request = request_for(mission_id, &plasmid);
    let signature = sign(&request, &issuer);
    eco.configure_hgt_trust(trusted_issuers(&issuer), &path).unwrap();
    {
        let store = BiologicalReceiptStore::open(&path);
        let mut lease = eco.verify_hgt_lease(request.clone(), &signature).unwrap();
        let mut recipient = ProkaryoticAgent::new("recipient-1");
        assert!(eco.hgt_transfer_under_lease(HgtTransferContext {
            recipient: &mut recipient, lease: &mut lease,
        }).unwrap().horizontal_transfer_success);
        assert_eq!(recipient.plasmids, vec![plasmid.clone()]);
        let receipts = store.read_all().unwrap();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0]["lease_signature"], signature);
        assert_eq!(receipts[0]["lease"]["nonce"], "nonce-001");
        let mut nonce_reuse = request.clone();
        nonce_reuse.lease_id = "lease-002".into();
        assert!(eco.resume_hgt_lease(nonce_reuse.clone(), &sign(&nonce_reuse, &issuer)).is_err(),
            "a nonce cannot be replayed under a different lease id");
    }
    {
        let mut restarted = GenosEcosystem::new("hgt-ed25519-restart");
        restarted.set_mission_id(mission_id);
        restarted.prokaryote = ProkaryoticAgent::new("donor-1").with_plasmid(plasmid.clone());
        restarted.configure_hgt_trust(trusted_issuers(&issuer), &path).unwrap();
        let mut lease = restarted.resume_hgt_lease(request, &signature).unwrap();
        let mut recipient = ProkaryoticAgent::new("recipient-1");
        restarted.hgt_transfer_under_lease(HgtTransferContext {
            recipient: &mut recipient, lease: &mut lease,
        }).unwrap();
        assert_eq!(recipient.plasmids, vec![plasmid]);
        assert_eq!(BiologicalReceiptStore::open(&path).read_all().unwrap().len(), 1);
    }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn unknown_tampered_or_expired_hgt_leases_are_rejected() {
    let issuer = SigningKey::from_bytes(&[9; 32]);
    let path = std::env::temp_dir().join(format!("genos-hgt-{}.jsonl", uuid::Uuid::new_v4()));
    let mut eco = GenosEcosystem::new("hgt-invalid-proofs");
    eco.configure_hgt_trust(trusted_issuers(&issuer), &path).unwrap();
    let plasmid = test_plasmid();
    let request = request_for(uuid::Uuid::new_v4(), &plasmid);
    let signature = sign(&request, &issuer);

    let mut tampered = request.clone();
    tampered.recipient_id = "other-recipient".into();
    assert!(eco.verify_hgt_lease(tampered, &signature).is_err());
    let mut expired = request.clone();
    expired.expires_at_unix_ms = 0;
    assert!(eco.verify_hgt_lease(expired.clone(), &sign(&expired, &issuer)).is_err());

    let mut untrusted = GenosEcosystem::new("hgt-untrusted-issuer");
    untrusted.configure_hgt_trust(
        HashMap::from([("different-issuer".to_string(), hex(issuer.verifying_key().as_bytes()))]),
        path,
    ).unwrap();
    assert!(untrusted.verify_hgt_lease(request, &signature).unwrap_err().contains("non approuvé"));
}

#[test]
fn absent_or_revoked_authority_refuses_before_receiver_mutation() {
    let issuer = SigningKey::from_bytes(&[11; 32]);
    let mission_id = uuid::Uuid::new_v4();
    let plasmid = test_plasmid();
    let path = std::env::temp_dir().join(format!("genos-hgt-{}.jsonl", uuid::Uuid::new_v4()));
    let mut eco = GenosEcosystem::new("hgt-revocation");
    let request = request_for(mission_id, &plasmid);
    let signature = sign(&request, &issuer);
    assert!(eco.verify_hgt_lease(request.clone(), &signature).is_err());
    eco.set_mission_id(mission_id);
    eco.prokaryote = ProkaryoticAgent::new("donor-1").with_plasmid(plasmid);
    eco.configure_hgt_trust(trusted_issuers(&issuer), &path).unwrap();
    let mut lease = eco.verify_hgt_lease(request, &signature).unwrap();
    eco.revoke_hgt_issuer("issuer-1").unwrap();
    let mut recipient = ProkaryoticAgent::new("recipient-1");

    assert!(eco.hgt_transfer_under_lease(HgtTransferContext {
        recipient: &mut recipient,
        lease: &mut lease,
    }).is_err());
    assert!(recipient.plasmids.is_empty());
    assert!(BiologicalReceiptStore::open(&path).read_all().unwrap().is_empty());
}
