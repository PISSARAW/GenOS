use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::genos_biology::{
    ObserverPerspective, RawSignalPacket, Tracheid, TracheidExecutionPlan, TracheidPlanInput,
    execute_tracheid_plan,
};

#[test]
fn tracheid_receipt_contains_typed_plan_and_baseline_cost_throughput_comparison() {
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
    assert_eq!(payload["executionPlan"]["schema"], "genos.tracheid-execution-plan/v1");
    assert_eq!(payload["executionPlan"]["artifactKind"], "runtime_plan");
    assert_eq!(payload["executionPlan"]["operations"][0], "check_cavitation");
    assert_eq!(payload["executionPlan"]["operations"][1], "pass_through_or_block");
    assert!(payload.get("measuredLatencyMicros").is_none());
}

#[test]
fn tracheid_plan_executor_matches_baseline_transport_outputs_and_costs() {
    let inputs = [
        TracheidPlanInput { volume: 8.5, tension_mpa: -4.5 },
        TracheidPlanInput { volume: 8.5, tension_mpa: -7.0 },
        TracheidPlanInput { volume: 0.0, tension_mpa: 0.0 },
    ];
    for input in inputs {
        let mut baseline = Tracheid::new("tracheid-plan-baseline");
        baseline.trigger_lignified_apoptosis("pipeline:equivalence").unwrap();
        let expected = baseline.transport_sap_stream(input.volume, input.tension_mpa).unwrap();
        let plan = TracheidExecutionPlan::new(
            "pipeline:equivalence",
            baseline.plate.cavitation_resistance_mpa,
        ).unwrap();
        let actual = execute_tracheid_plan(&plan, &baseline, input).unwrap();

        assert_eq!(actual.transported_volume, expected.transported_volume);
        assert_eq!(actual.tension_applied_mpa, expected.tension_applied_mpa);
        assert_eq!(actual.token_cost, expected.token_cost);
        assert_eq!(actual.cavitation_detected, expected.cavitation_detected);
        assert_eq!(actual.conduit_state, expected.conduit_state);
    }
}

#[test]
fn tracheid_plan_executor_refuses_unknown_and_malformed_operations() {
    let unknown = serde_json::json!({
        "schema": "genos.tracheid-execution-plan/v1",
        "artifactKind": "runtime_plan",
        "pipelineId": "pipeline:unknown",
        "operations": ["unknown_operation"],
        "cavitationResistanceMpa": -6.5
    });
    assert!(serde_json::from_value::<TracheidExecutionPlan>(unknown).is_err());

    let mut tracheid = Tracheid::new("tracheid-plan-invalid");
    tracheid.trigger_lignified_apoptosis("pipeline:malformed").unwrap();
    let mut malformed = TracheidExecutionPlan::new(
        "pipeline:malformed",
        tracheid.plate.cavitation_resistance_mpa,
    ).unwrap();
    malformed.operations.clear();
    assert!(execute_tracheid_plan(
        &malformed,
        &tracheid,
        TracheidPlanInput { volume: 1.0, tension_mpa: 0.0 },
    ).is_err());

    let mut out_of_order = TracheidExecutionPlan::new(
        "pipeline:malformed",
        tracheid.plate.cavitation_resistance_mpa,
    ).unwrap();
    out_of_order.operations.swap(0, 1);
    assert!(out_of_order.validate().is_err());
    assert!(execute_tracheid_plan(
        &out_of_order,
        &tracheid,
        TracheidPlanInput { volume: 1.0, tension_mpa: 0.0 },
    ).is_err());
}

#[test]
fn tracheid_plan_executor_refuses_an_unmatched_target_or_invalid_input() {
    let mut tracheid = Tracheid::new("tracheid-plan-target");
    let plan = TracheidExecutionPlan::new("pipeline:target", -6.5).unwrap();
    assert!(execute_tracheid_plan(
        &plan,
        &tracheid,
        TracheidPlanInput { volume: 1.0, tension_mpa: 0.0 },
    ).is_err());
    tracheid.trigger_lignified_apoptosis("pipeline:target").unwrap();
    assert!(execute_tracheid_plan(
        &plan,
        &tracheid,
        TracheidPlanInput { volume: f64::NAN, tension_mpa: 0.0 },
    ).is_err());
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
