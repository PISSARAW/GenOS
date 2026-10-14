use crate::planner::Goal;
use crate::GenosEcosystem;
use genos_cell::AgentCell;

#[test]
fn mission_tick_applies_and_records_active_cell_metabolism() {
    let mut ecosystem = GenosEcosystem::new("cell-metabolism-tick-test");
    ecosystem
        .orchestrator
        .create_tissue("Metabolism", "Worker")
        .expect("create tissue");
    let cell_id = ecosystem
        .orchestrator
        .add_worker(
            "Metabolism",
            AgentCell::new("MetabolicCell", "tick fixture", "Worker"),
        )
        .expect("add worker");
    let entropy_before = ecosystem.orchestrator.active_cells[&cell_id]
        .metabolism
        .entropy_level;

    let _report = ecosystem.tick(&Goal::Explore);

    let cell = &ecosystem.orchestrator.active_cells[&cell_id];
    assert!(cell.metabolism.entropy_level > entropy_before);
    let event = ecosystem
        .events
        .read_stream(0)
        .into_iter()
        .find(|event| {
            event.event_type == "CELL_METABOLISM_TICK"
                && event.payload["observation"]["cellId"] == cell_id.to_string()
        })
        .expect("tick should record the active cell metabolism observation");
    assert_eq!(event.payload["schema"], "genos.cell-metabolism-tick/v1");
    assert!(event.payload["observation"]["entropyAfter"].as_f64().unwrap() > entropy_before);
}
