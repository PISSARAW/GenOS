use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::checkpoint::CheckpointManager;
use genos_store::BiologicalReceiptStore;

pub(super) fn resume_population_if_available(
    ecosystem: &mut GenosEcosystem,
    checkpoints: &CheckpointManager,
    store: &BiologicalReceiptStore,
) -> Result<(), String> {
    if checkpoints.is_rewound().map_err(|error| error.to_string())? {
        return Ok(());
    }
    let has_population_snapshot = store
        .read_all()?
        .iter()
        .any(|receipt| receipt["schema"] == "genos.population-state/v1");
    if !has_population_snapshot {
        return Ok(());
    }
    let mission_id = ecosystem
        .mission_id
        .ok_or_else(|| "mission identity is required to resume population".to_string())?;
    ecosystem.resume_mission_from_journal(mission_id)
}
