use super::*;
use crate::GenosEcosystem;

#[test]
fn receipt_correlates_real_root_cell_genome_mission_and_cost() {
    let mission_id = Uuid::new_v4();
    let mut ecosystem = GenosEcosystem::new("receipt-test");
    ecosystem.set_mission_id(mission_id);
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    let genome_id = ecosystem
        .seed_germline(cell_id, "receipt-test-genome")
        .unwrap();
    let expected_fingerprint = ecosystem.orchestrator.genomes[&genome_id]
        .fingerprint()
        .unwrap()
        .content_hash;
    let receipt = ecosystem.execution_receipt(Concept::Observe, true, true);

    assert_eq!(receipt.schema, "genos.biological-execution-receipt/v1");
    assert_eq!(receipt.mission_id, Some(mission_id));
    assert_eq!(receipt.cell_id, Some(cell_id));
    assert_eq!(receipt.genome_id, Some(genome_id));
    assert_eq!(
        receipt.genome_fingerprint.as_deref(),
        Some(expected_fingerprint.as_str())
    );
    assert!(receipt.cost > 0.0);
    assert_eq!(receipt.cost_unit, "atp_token");
    assert!(receipt.consumed && receipt.completed);
}

#[test]
fn receipt_does_not_invent_a_genome_for_an_unseeded_root_cell() {
    let ecosystem = GenosEcosystem::new("unseeded-receipt-test");
    let receipt = ecosystem.execution_receipt(Concept::Observe, false, false);

    assert_eq!(
        receipt.cell_id,
        Some(ecosystem.orchestrator.orchestrator_id)
    );
    assert_eq!(receipt.genome_id, None);
    assert_eq!(receipt.genome_fingerprint, None);
}

#[test]
fn refused_metabolic_debit_is_not_reported_as_consumed_or_completed() {
    let ecosystem = GenosEcosystem::new("receipt-test");
    let receipt = ecosystem.execution_receipt(Concept::Observe, false, false);

    assert!(!receipt.consumed);
    assert!(!receipt.completed);
    assert_eq!(receipt.metabolic_register, "rust_orchestrator_metabolism");
}

#[test]
fn tick_delivers_measured_threat_into_neural_runtime() {
    let mut ecosystem = GenosEcosystem::new("neural-tick-test");
    let initial_potential = ecosystem.neuro.current_potential();
    let state = WorldState {
        threat: 0.9,
        stress: 0.2,
        ..WorldState::default()
    };
    assert!(pre_deliberation(&mut ecosystem, &state).is_none());

    let event = ecosystem
        .events
        .read_stream(1)
        .into_iter()
        .find(|entry| entry.event_type == "NEURAL_MISSION_SIGNAL")
        .expect("tick should persist the measured neural signal");
    assert_eq!(event.payload["threat"], 0.9);
    assert_eq!(event.payload["stress"], 0.2);
    assert!(event.payload["spike_count"].is_number());
    assert!(ecosystem.neuro.current_potential() >= initial_potential);
}

#[test]
fn neural_mission_signal_ignores_non_finite_input() {
    let mut ecosystem = GenosEcosystem::new("invalid-neural-tick-test");
    assert!(pre_deliberation(
        &mut ecosystem,
        &WorldState {
            threat: f64::NAN,
            stress: f64::INFINITY,
            ..WorldState::default()
        }
    )
    .is_none());
    assert!(!ecosystem
        .events
        .read_stream(1)
        .iter()
        .any(|event| event.event_type == "NEURAL_MISSION_SIGNAL"));
}

#[test]
fn mission_tick_applies_guard_cell_backpressure_to_planning_budget() {
    let mut ecosystem = GenosEcosystem::new("guard-cell-mission-flux-test");
    ecosystem.orchestrator.metabolism.atp = 50.0;

    let _ = ecosystem.tick(&Goal::Explore);

    let event = ecosystem
        .events
        .read_stream(0)
        .into_iter()
        .find(|event| event.event_type == "MISSION_FLUX_REGULATED")
        .expect("mission tick should report guard-cell flux regulation");
    assert_eq!(event.payload["schema"], "genos.guard-cell-mission-flux/v1");
    assert!(event.payload["resourceRatio"].as_f64().unwrap() < 1.0);
    assert!(
        event.payload["admittedFlux"].as_f64().unwrap()
            < event.payload["requestedFlux"].as_f64().unwrap()
    );
    assert_eq!(event.payload["permission"], "planning_budget_only");
}
