use genos_orchestrator::metabolism::MissionMetabolicPoolDemand;
use genos_orchestrator::GenosEcosystem;
use uuid::Uuid;

#[test]
fn mission_pool_consumption_measures_success_and_refusal() {
    let mut ecosystem = GenosEcosystem::new("metabolic-pool-enforcement");
    let mission_id = Uuid::new_v4();
    ecosystem.set_mission_id(mission_id);
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    ecosystem.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 5.0;

    let accepted = ecosystem
        .consume_mission_metabolic_pool(MissionMetabolicPoolDemand {
            cell_id,
            operation: "mission.test.consume".into(),
            amino_acids: 2.0,
        })
        .unwrap();
    assert!(accepted.accepted);
    assert_eq!(accepted.mission_id, mission_id);
    assert_eq!(accepted.amino_acids_before, 5.0);
    assert_eq!(accepted.amino_acids_after, 3.0);

    let refused = ecosystem
        .consume_mission_metabolic_pool(MissionMetabolicPoolDemand {
            cell_id,
            operation: "mission.test.insufficient".into(),
            amino_acids: 4.0,
        })
        .unwrap();
    assert!(!refused.accepted);
    assert_eq!(refused.amino_acids_before, 3.0);
    assert_eq!(refused.amino_acids_after, 3.0);
    assert!(refused.refusal_reason.as_deref().unwrap().contains("insufficient"));
    let events = ecosystem.read_events(0);
    assert_eq!(events.iter().filter(|event| event.event_type == "MISSION_METABOLIC_POOL_RECEIPT").count(), 2);
}

#[test]
fn guard_flux_uses_the_mission_pool_and_closes_when_depleted() {
    let mut ecosystem = GenosEcosystem::new("metabolic-pool-guard");
    ecosystem.set_mission_id(Uuid::new_v4());
    let cell_id = ecosystem.orchestrator.orchestrator_id;
    let available = ecosystem.orchestrator.active_cells[&cell_id].metabolism.amino_acids;
    let funded = ecosystem.throttle_flux(10.0);
    assert_eq!(funded.admitted_flux, 10.0);
    let after_funded = ecosystem.orchestrator.active_cells[&cell_id].metabolism.amino_acids;
    assert!(after_funded < available);

    ecosystem.orchestrator.active_cells.get_mut(&cell_id).unwrap().metabolism.amino_acids = 0.0;

    let result = ecosystem.throttle_flux(100.0);
    assert_eq!(result.admitted_flux, 0.0);
    let cell = ecosystem.orchestrator.active_cells.get(&cell_id).unwrap();
    assert_eq!(cell.metabolism.amino_acids, 0.0);
    let receipt = ecosystem.read_events(0).into_iter()
        .filter(|event| event.event_type == "MISSION_METABOLIC_POOL_RECEIPT")
        .last()
        .unwrap();
    assert_eq!(receipt.payload["mission_id"], ecosystem.mission_id.unwrap().to_string());
    assert_eq!(receipt.payload["amino_acids_before"], 0.0);
    assert_eq!(receipt.payload["amino_acids_after"], 0.0);
}
