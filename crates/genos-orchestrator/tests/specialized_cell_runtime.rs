use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::genos_biology::{
    ObserverPerspective, Plasmid, ProkaryoticAgent, RawSignalPacket,
};

#[test]
fn ecosystem_specialized_cells_return_measured_runtime_effects() {
    let mut eco = GenosEcosystem::new("specialized-cell-runtime");

    eco.guard_cell.regulate(0.2, 0.95);
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
    let mut recipient = ProkaryoticAgent::new("runtime-recipient");
    let transfer = eco.hgt_transfer(&mut recipient, "p-runtime").unwrap();
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
