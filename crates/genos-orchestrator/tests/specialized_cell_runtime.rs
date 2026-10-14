use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::genos_biology::{
    ObserverPerspective, RawSignalPacket,
};

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

}
