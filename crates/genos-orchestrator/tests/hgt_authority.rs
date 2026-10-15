use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::genos_biology::{Plasmid, ProkaryoticAgent};
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::hgt_runtime::{
    HgtLeaseRequest, HgtTransferContext, plasmid_digest,
};
use std::collections::HashMap;
use std::process::{Child, Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

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
    remove_hgt_test_files(&path);
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
    remove_hgt_test_files(&path);
}

#[test]
fn independent_processes_serialize_same_lease_and_replay_one_receipt() {
    if transfer_child_requested() {
        transfer_child_process();
        return;
    }
    let issuer = SigningKey::from_bytes(&[17; 32]);
    let mission_id = uuid::Uuid::new_v4();
    let plasmid = test_plasmid();
    let mut request = request_for(mission_id, &plasmid);
    request.expires_at_unix_ms += 3_600_000;
    let signature = sign(&request, &issuer);
    let directory = std::env::temp_dir().join(format!("genos-hgt-process-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let journal = directory.join("receipts.jsonl");
    let gate = directory.join("start");
    let ready = [directory.join("ready-1"), directory.join("ready-2")];
    let children = ready.iter().map(|ready_path| {
        spawn_transfer_child(ChildTransfer {
            journal: &journal,
            gate: &gate,
            ready: ready_path,
            request: &request,
            signature: &signature,
            issuer: &issuer,
        })
    }).collect::<Vec<_>>();

    wait_for_children(&ready);
    std::fs::write(&gate, b"go").unwrap();
    assert_children_succeeded(children);
    assert_eq!(BiologicalReceiptStore::open(&journal).read_all().unwrap().len(), 1);
    assert_replay_after_child_process(ReplayTransfer {
        journal: &journal,
        mission_id,
        plasmid: &plasmid,
        request,
        signature,
        issuer: &issuer,
    });
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn hgt_transfer_child_process() {
    if transfer_child_requested() {
        transfer_child_process();
    }
}

fn transfer_child_requested() -> bool {
    std::env::var_os("GENOS_HGT_CHILD_JOURNAL").is_some()
}

fn remove_hgt_test_files(journal: &std::path::Path) {
    let _ = std::fs::remove_file(journal);
    let _ = std::fs::remove_file(journal.with_extension("hgt.lock"));
}

fn transfer_child_process() {
    let journal = std::path::PathBuf::from(std::env::var_os("GENOS_HGT_CHILD_JOURNAL").unwrap());
    let gate = std::path::PathBuf::from(std::env::var_os("GENOS_HGT_CHILD_GATE").unwrap());
    let ready = std::path::PathBuf::from(std::env::var_os("GENOS_HGT_CHILD_READY").unwrap());
    let request_json = std::env::var("GENOS_HGT_CHILD_REQUEST").unwrap();
    let signature = std::env::var("GENOS_HGT_CHILD_SIGNATURE").unwrap();
    let issuer_public = std::env::var("GENOS_HGT_CHILD_PUBLIC_KEY").unwrap();
    let request: HgtLeaseRequest = serde_json::from_str(&request_json).unwrap();
    let plasmid = test_plasmid();
    let mut ecosystem = GenosEcosystem::new("hgt-process-child");
    ecosystem.set_mission_id(request.mission_id);
    ecosystem.prokaryote = ProkaryoticAgent::new("donor-1").with_plasmid(plasmid);
    ecosystem.configure_hgt_trust(
        HashMap::from([("issuer-1".into(), issuer_public)]),
        &journal,
    ).unwrap();
    std::fs::write(&ready, b"ready").unwrap();
    wait_for_gate(&gate);
    let mut lease = ecosystem.verify_hgt_lease(request, &signature).unwrap();
    let mut recipient = ProkaryoticAgent::new("recipient-1");
    let report = ecosystem.hgt_transfer_under_lease(HgtTransferContext {
        recipient: &mut recipient,
        lease: &mut lease,
    }).unwrap();
    assert!(report.horizontal_transfer_success);
    assert_eq!(recipient.plasmids.len(), 1);
}

struct ChildTransfer<'a> {
    journal: &'a std::path::Path,
    gate: &'a std::path::Path,
    ready: &'a std::path::Path,
    request: &'a HgtLeaseRequest,
    signature: &'a str,
    issuer: &'a SigningKey,
}

fn spawn_transfer_child(input: ChildTransfer<'_>) -> Child {
    Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "hgt_transfer_child_process"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GENOS_HGT_CHILD_JOURNAL", input.journal)
        .env("GENOS_HGT_CHILD_GATE", input.gate)
        .env("GENOS_HGT_CHILD_READY", input.ready)
        .env("GENOS_HGT_CHILD_REQUEST", serde_json::to_string(input.request).unwrap())
        .env("GENOS_HGT_CHILD_SIGNATURE", input.signature)
        .env("GENOS_HGT_CHILD_PUBLIC_KEY", hex(input.issuer.verifying_key().as_bytes()))
        .spawn()
        .unwrap()
}

fn wait_for_children(ready: &[std::path::PathBuf]) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while ready.iter().any(|path| !path.exists()) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(ready.iter().all(|path| path.exists()), "child processes did not reach the common gate");
}

fn wait_for_gate(path: &std::path::Path) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while !path.exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(path.exists(), "parent process did not release the common gate");
}

fn assert_children_succeeded(children: Vec<Child>) {
    for child in children {
        let output = child.wait_with_output().unwrap();
        assert_child_output(output);
    }
}

fn assert_child_output(output: Output) {
    assert!(
        output.status.success(),
        "HGT child failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

struct ReplayTransfer<'a> {
    journal: &'a std::path::Path,
    mission_id: uuid::Uuid,
    plasmid: &'a Plasmid,
    request: HgtLeaseRequest,
    signature: String,
    issuer: &'a SigningKey,
}

fn assert_replay_after_child_process(input: ReplayTransfer<'_>) {
    let mut ecosystem = GenosEcosystem::new("hgt-process-replay");
    ecosystem.set_mission_id(input.mission_id);
    ecosystem.prokaryote = ProkaryoticAgent::new("donor-1").with_plasmid(input.plasmid.clone());
    ecosystem.configure_hgt_trust(trusted_issuers(input.issuer), input.journal).unwrap();
    let mut lease = ecosystem.resume_hgt_lease(input.request, &input.signature).unwrap();
    let mut recipient = ProkaryoticAgent::new("recipient-1");
    ecosystem.hgt_transfer_under_lease(HgtTransferContext {
        recipient: &mut recipient,
        lease: &mut lease,
    }).unwrap();
    assert_eq!(recipient.plasmids, vec![input.plasmid.clone()]);
    assert_eq!(BiologicalReceiptStore::open(input.journal).read_all().unwrap().len(), 1);
}
