use genos_cell::AgentCell;
use genos_orchestrator::GenosEcosystem;
use serde_json::json;
use uuid::Uuid;

#[test]
fn mission_quorum_excludes_apoptotic_cells_from_signaling_density() {
    let mut ecosystem = GenosEcosystem::new("viable-quorum-test");
    ecosystem.set_mission_id(Uuid::new_v4());
    ecosystem
        .orchestrator
        .create_tissue("Workers", "mission")
        .expect("create tissue");
    ecosystem.orchestrator.active_cells
        .get_mut(&ecosystem.orchestrator.orchestrator_id)
        .expect("root cell")
        .conscience
        .is_apoptotic = true;
    ecosystem
        .orchestrator
        .add_worker("Workers", AgentCell::new("live", "fixture", "Worker"))
        .expect("add live cell");
    let mut apoptotic = AgentCell::new("dead", "fixture", "Worker");
    apoptotic.conscience.is_apoptotic = true;
    ecosystem
        .orchestrator
        .add_worker("Workers", apoptotic)
        .expect("add apoptotic cell");

    ecosystem.record_event(
        "BIOLOGICAL_EXECUTION_RECEIPT",
        json!({ "completed": true, "cost": 1.0 }),
    );

    let response = ecosystem
        .events
        .read_stream(0)
        .into_iter()
        .find(|event| event.event_type == "MISSION_NEURO_GLIA_QUORUM_RESPONSE")
        .expect("mission event should produce a coupled response");
    assert_eq!(response.payload["quorum"]["activeCellCount"], 1);
    assert_eq!(response.payload["quorum"]["registeredCellCount"], 3);
    assert_eq!(ecosystem.quorum.cell_count, 1);
}
