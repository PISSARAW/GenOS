use genos_biology::{Plasmid, ProkaryoticAgent};
use genos_orchestrator::checkpoint::{CheckpointManager, OrchestratorCheckpointState};
use genos_orchestrator::GenosEcosystem;
use tempfile::tempdir_in;
use uuid::Uuid;

fn donor() -> ProkaryoticAgent {
    ProkaryoticAgent::new("persisted-hgt-donor").with_plasmid(Plasmid {
        plasmid_id: "p-persisted".into(),
        skill_name: "SAFE_SKILL".into(),
        executable_payload: "data-only".into(),
        resistance_marker: "marker".into(),
        copy_number: 1,
    })
}

#[test]
fn mission_checkpoint_restores_hgt_donor_and_plasmids_after_manager_restart() {
    let dir = tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("hgt-checkpoint-source");
    source.set_mission_id(mission);
    source.prokaryote = donor();
    let state = OrchestratorCheckpointState::from_ecosystem(&source).unwrap();

    let mut manager = CheckpointManager::new(dir.path(), 1).unwrap();
    manager.create_checkpoint(&state).unwrap();
    drop(manager);

    let restarted_manager = CheckpointManager::new(dir.path(), 1).unwrap();
    let checkpoint = restarted_manager.load_latest_checkpoint().unwrap().unwrap();
    let restored_state: OrchestratorCheckpointState =
        serde_json::from_value(checkpoint.orchestrator_state).unwrap();
    let mut restored = GenosEcosystem::new("hgt-checkpoint-restored");
    restored.set_mission_id(mission);
    assert!(restored_state.apply_to_ecosystem(&mut restored).unwrap());
    assert_eq!(restored.prokaryote.id, "persisted-hgt-donor");
    assert_eq!(restored.prokaryote.plasmids, donor().plasmids);
}

#[test]
fn altered_or_cross_mission_hgt_checkpoint_refuses_before_ecosystem_mutation() {
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("hgt-checkpoint-source");
    source.set_mission_id(mission);
    source.prokaryote = donor();
    let state = OrchestratorCheckpointState::from_ecosystem(&source).unwrap();

    let mut altered = state.clone();
    altered.prokaryote.as_mut().unwrap().donor.plasmids[0].executable_payload = "changed".into();
    let mut target = GenosEcosystem::new("hgt-checkpoint-target");
    target.set_mission_id(mission);
    assert!(altered.apply_to_ecosystem(&mut target).unwrap_err().contains("digest"));
    assert_eq!(target.prokaryote.id, "orchestrator_donor");

    target.set_mission_id(Uuid::new_v4());
    assert!(state.apply_to_ecosystem(&mut target).unwrap_err().contains("identity"));
    assert_eq!(target.prokaryote.id, "orchestrator_donor");
}
