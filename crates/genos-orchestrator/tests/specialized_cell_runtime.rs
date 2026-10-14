use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::hgt_runtime::{
    HgtLeaseAuthority, HgtLeaseRequest, HgtTransferContext, HgtTransferLease,
};
use genos_orchestrator::genos_biology::{
    ObserverPerspective, Plasmid, ProkaryoticAgent, RawSignalPacket,
};
use genos_orchestrator::genos_store::BiologicalReceiptStore;

#[test]
fn tracheid_receipt_repeats_same_input_cost_and_throughput_comparison() {
    let mut eco = GenosEcosystem::new("tracheid-comparison");
    eco.ossify_pipeline("pipeline:comparison").unwrap();

    let receipt = eco
        .read_events(1)
        .into_iter()
        .find(|event| event.event_type == "TRACHEID_PIPELINE_OSSIFIED")
        .expect("ossification receipt is recorded");
    let payload = receipt.payload;

    assert_eq!(payload["comparisonInputVolume"], 1.0);
    assert_eq!(payload["livingCost"], 15.0);
    assert_eq!(payload["ossifiedCost"], 0.0);
    assert_eq!(payload["livingThroughput"], 0.2);
    assert_eq!(payload["ossifiedThroughput"], 1.0);
    assert_eq!(payload["compiledPlan"]["artifactKind"], "runtime_plan");
    assert!(payload["measuredLatencyMicros"].as_u64().is_some());
}

#[test]
fn ecosystem_specialized_cells_return_measured_runtime_effects() {
    let mut eco = GenosEcosystem::new("specialized-cell-runtime");
    let mission_id = uuid::Uuid::new_v4();
    eco.set_mission_id(mission_id);

    let root_cell_id = eco.orchestrator.orchestrator_id;
    eco.orchestrator
        .active_cells
        .get_mut(&root_cell_id)
        .unwrap()
        .metabolism
        .amino_acids = 1.0;
    let throttled = eco.throttle_flux(100.0);
    assert_eq!(throttled.requested_flux, 100.0);
    assert!(throttled.admitted_flux <= 1.0);
    assert!(throttled.backpressure_active);

    let ossification = eco.ossify_pipeline("pipeline:test").unwrap();
    assert_eq!(ossification.static_conduit_id, "pipeline:test");
    let transport = eco.tracheid.transport_sap_stream(100.0, -4.5).unwrap();
    assert_eq!(transport.transported_volume, 100.0);
    assert_eq!(transport.token_cost, 0.0);
    assert!(!transport.cavitation_detected);

    let packets = [
        RawSignalPacket {
            id: "retained".into(),
            size_nm: 150.0,
            semantic_density: 0.9,
            content: "measured signal".into(),
            is_noise: false,
        },
        RawSignalPacket {
            id: "rejected".into(),
            size_nm: 50.0,
            semantic_density: 0.1,
            content: "noise".into(),
            is_noise: true,
        },
    ];
    let filtered = eco.filter_stream(&packets);
    assert_eq!(filtered.total_scanned, 2);
    assert_eq!(filtered.retained_signals.len(), 1);
    assert_eq!(filtered.rejected_noise_count, 1);

    let rendered = eco.render_polymorphic("measured signal", &ObserverPerspective::StructuredJson);
    let rendered: serde_json::Value = serde_json::from_str(&rendered).unwrap();
    assert_eq!(rendered["payload"], "measured signal");
    assert!(rendered["spectral_band_nm"].as_f64().unwrap() > 0.0);

    eco.prokaryote = ProkaryoticAgent::new("runtime-donor").with_plasmid(Plasmid {
        plasmid_id: "p-runtime".into(),
        skill_name: "signal-filter".into(),
        executable_payload: "PAYLOAD_NOT_EXECUTED".into(),
        resistance_marker: "test".into(),
        copy_number: 1,
    });
    let receipt_path = std::env::temp_dir().join(format!("genos-hgt-{}.jsonl", uuid::Uuid::new_v4()));
    let request = HgtLeaseRequest {
        lease_id: "lease-runtime-test".into(),
        issuer_id: "mission-authority".into(),
        mission_id,
        donor_id: "runtime-donor".into(),
        recipient_id: "runtime-recipient".into(),
        plasmid_id: "p-runtime".into(),
        expires_at_unix_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
            + 250,
    };
    let transfer = {
        let store = BiologicalReceiptStore::open(&receipt_path);
        let authority = HgtLeaseAuthority::new("test-hgt-issuer-secret", &store).unwrap();
        let wrong_authority = HgtLeaseAuthority::new("wrong-secret", &store).unwrap();
        let mut expired_request = request.clone();
        expired_request.expires_at_unix_ms = 0;
        assert!(HgtTransferLease::grant(expired_request, &authority).is_err());
        let mut lease = HgtTransferLease::grant(request.clone(), &authority).unwrap();
        let mut recipient = ProkaryoticAgent::new("runtime-recipient");
        assert!(eco.hgt_transfer_under_lease(HgtTransferContext {
            recipient: &mut recipient,
            lease: &mut lease,
            authority: &wrong_authority,
        }).is_err());
        assert!(recipient.plasmids.is_empty());
        let transfer = eco.hgt_transfer_under_lease(HgtTransferContext {
            recipient: &mut recipient,
            lease: &mut lease,
            authority: &authority,
        }).unwrap();
        assert!(transfer.horizontal_transfer_success);
        assert_eq!(recipient.plasmids.len(), 1);
        let receipts = store.read_all().unwrap();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0]["outcome"], "TRANSFERRED");
        assert_eq!(receipts[0]["issuer_id"], "mission-authority");
        assert!(receipts[0]["receipt_signature"].as_str().is_some());
        transfer
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    if request.expires_at_unix_ms > now {
        std::thread::sleep(std::time::Duration::from_millis(
            (request.expires_at_unix_ms - now + 1) as u64,
        ));
    }
    let reopened = BiologicalReceiptStore::open(&receipt_path);
    let authority = HgtLeaseAuthority::new("test-hgt-issuer-secret", &reopened).unwrap();
    assert!(HgtTransferLease::grant(request.clone(), &authority).is_err());
    let mut replay_lease = HgtTransferLease::resume(request, &authority).unwrap();
    assert!(!replay_lease.is_active());
    let mut restarted_recipient = ProkaryoticAgent::new("runtime-recipient");
    let replayed = eco.hgt_transfer_under_lease(HgtTransferContext {
        recipient: &mut restarted_recipient,
        lease: &mut replay_lease,
        authority: &authority,
    }).unwrap();
    assert_eq!(
        serde_json::to_value(replayed).unwrap(),
        serde_json::to_value(&transfer).unwrap()
    );
    assert_eq!(restarted_recipient.plasmids.len(), 1);
    assert_eq!(reopened.read_all().unwrap().len(), 1);
    std::fs::remove_file(receipt_path).unwrap();
    let recipient = restarted_recipient;
    assert!(transfer.horizontal_transfer_success);
    assert_eq!(recipient.plasmids.len(), 1);
    assert!(
        recipient
            .execute_plasmid("p-runtime")
            .unwrap()
            .execution_output
            .starts_with("PAYLOAD_NOT_EXECUTED_")
    );
}
