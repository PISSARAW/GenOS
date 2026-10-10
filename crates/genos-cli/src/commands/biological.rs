use crate::args::{BiologicalCmd, RhizomeCmd, RhizomeSubcommands};
use crate::commands::{rhizome_telemetry, syncytium_crdt};
use serde_json::json;

pub fn handle(cmd: &BiologicalCmd) -> Result<(), String> {
    let mode = cmd.mode.trim().to_ascii_lowercase();

    if cmd.tick {
        return run_mission_tick(cmd);
    }

    if cmd.serve {
        if mode == "syncytium" {
            return syncytium_crdt::run(cmd.port, &cmd.mission);
        }
        return rhizome_telemetry::run(cmd.port);
    }

    let roles =
        match mode.as_str() {
            "biome" => [
                "environment_mapper",
                "resource_steward",
                "population_specialist",
                "ecosystem_observer",
            ],
            "syncytium" => [
                "shared_state_coordinator",
                "parallel_executor",
                "consistency_guardian",
                "integration_executor",
            ],
            "holobionte" => [
                "host_orchestrator",
                "specialist_symbiont",
                "immune_symbiont",
                "memory_symbiont",
            ],
            "biocenose" => [
                "community_facilitator",
                "independent_solver",
                "adversarial_reviewer",
                "consensus_observer",
            ],
            "rhizome" => [
                "rootless_coordinator",
                "capability_offshoot",
                "local_bridge",
                "boundary_scout",
            ],
            "metapopulation" => [
                "population_isolator",
                "quorum_sensor",
                "synaptic_adaptor",
                "regeneration_steward",
            ],
            _ => return Err(
                "mode must be biome, syncytium, holobionte, biocenose, rhizome, or metapopulation"
                    .to_string(),
            ),
        };
    if cmd.mission.trim().is_empty() {
        return Err("mission must not be empty".to_string());
    }
    println!(
        "{}",
        json!({
            "success": true,
            "operation": "biological_mode",
            "mode": mode,
            "mission": cmd.mission,
            "mechanisms": if mode == "metapopulation" { json!(["quorum_sensing", "synaptic_plasticity", "regeneration"]) } else { json!([]) },
            "members": roles.iter().enumerate().map(|(index, role)| json!({
                "member_number": index + 1,
                "role": role
            })).collect::<Vec<_>>()
        })
    );
    Ok(())
}

fn run_mission_tick(cmd: &BiologicalCmd) -> Result<(), String> {
    let mission_id = cmd
        .mission_id
        .ok_or_else(|| "mission_id UUID is required for a persisted biological tick".to_string())?;
    if cmd.mission.trim().is_empty() {
        return Err("mission must not be empty".to_string());
    }
    let root = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or(std::env::current_dir().map_err(|error| error.to_string())?);
    let journal_dir = root.join("biological-receipts");
    std::fs::create_dir_all(&journal_dir)
        .map_err(|error| format!("receipt journal unavailable: {error}"))?;
    run_and_report(cmd, mission_id, &journal_dir)
}

fn run_and_report(
    cmd: &BiologicalCmd,
    mission_id: uuid::Uuid,
    journal_dir: &std::path::Path,
) -> Result<(), String> {
    use genos_orchestrator::checkpoint::CheckpointManager;
    use genos_orchestrator::{GenosEcosystem, planner::Goal};
    use genos_store::BiologicalReceiptStore;

    let store = BiologicalReceiptStore::open(journal_dir.join(format!("{mission_id}.jsonl")));
    let mut checkpoints =
        CheckpointManager::new(journal_dir.join(format!("{mission_id}.continuity")), 1)
            .map_err(|error| format!("mission checkpoint unavailable: {error}"))?;
    let mut ecosystem = GenosEcosystem::new(&cmd.mission);
    ecosystem.set_mission_id(mission_id);
    restore_or_seed(&mut ecosystem, &mut checkpoints, cmd)?;
    restore_receipt_tick(&mut ecosystem, &store)?;
    let (report, mut receipts) = ecosystem
        .tick_and_persist_with_receipts(&Goal::Explore, &store)
        .map_err(|error| {
            format!(
                "biological tick receipts were not persisted: {}",
                error.message
            )
        })?;
    if cmd.divide {
        let division = ecosystem
            .divide_for_mission(&store)
            .map_err(|error| format!("mission division receipt was not persisted: {error:?}"))?;
        receipts.push(serde_json::to_value(division).map_err(|error| error.to_string())?);
    }
    save_checkpoint(&mut checkpoints, &ecosystem)?;
    println!(
        "{}",
        json!({
            "success": true,
            "operation": "biological_mission_tick",
            "mission_id": mission_id,
            "tick": report.tick,
            "receipts": receipts
        })
    );
    Ok(())
}

fn save_checkpoint(
    checkpoints: &mut genos_orchestrator::checkpoint::CheckpointManager,
    ecosystem: &genos_orchestrator::GenosEcosystem,
) -> Result<(), String> {
    let state = genos_orchestrator::checkpoint::OrchestratorCheckpointState::from_ecosystem(ecosystem)?;
    checkpoints.create_checkpoint(&state)
        .map_err(|error| format!("mission checkpoint was not persisted: {error}"))
}

fn restore_receipt_tick(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    store: &genos_store::BiologicalReceiptStore,
) -> Result<(), String> {
    let mission = serde_json::json!(ecosystem.mission_id);
    let tick = store.read_all()?.iter()
        .filter(|receipt| receipt["mission_id"] == mission)
        .filter_map(|receipt| receipt["tick"].as_u64())
        .max().unwrap_or(0);
    ecosystem.receipt_tick = ecosystem.receipt_tick.max(tick);
    Ok(())
}

#[cfg(test)]
mod receipt_tick_tests {
    use super::restore_receipt_tick;
    use genos_orchestrator::GenosEcosystem;
    use genos_store::BiologicalReceiptStore;
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn legacy_checkpoint_recovers_tick_from_its_own_verified_journal() {
        let path = std::env::temp_dir().join(format!("genos-tick-{}.jsonl", Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mission = Uuid::new_v4();
        store.append_receipts(&[
            json!({"mission_id": mission, "tick": 4}),
            json!({"mission_id": Uuid::new_v4(), "tick": 90}),
        ]).unwrap();
        let mut ecosystem = GenosEcosystem::new("legacy-checkpoint");
        ecosystem.set_mission_id(mission);
        restore_receipt_tick(&mut ecosystem, &store).unwrap();
        assert_eq!(ecosystem.receipt_tick, 4);
        ecosystem.receipt_tick = 8;
        restore_receipt_tick(&mut ecosystem, &store).unwrap();
        assert_eq!(ecosystem.receipt_tick, 8);
        std::fs::remove_file(path).unwrap();
    }
}

fn restore_or_seed(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    checkpoints: &mut genos_orchestrator::checkpoint::CheckpointManager,
    cmd: &BiologicalCmd,
) -> Result<(), String> {
    let Some(checkpoint) = checkpoints
        .load_latest_checkpoint()
        .map_err(|error| format!("mission checkpoint could not be loaded: {error}"))?
    else {
        let cell_id = ecosystem.orchestrator.orchestrator_id;
        ecosystem.seed_germline(cell_id, &cmd.mission)?;
        return Ok(());
    };
    let state: genos_orchestrator::checkpoint::OrchestratorCheckpointState =
        serde_json::from_value(checkpoint.orchestrator_state)
            .map_err(|error| format!("mission checkpoint is invalid: {error}"))?;
    if state.mission_id != cmd.mission_id {
        return Err("mission checkpoint identity does not match the requested mission".into());
    }
    if !state.apply_to_ecosystem(ecosystem)? {
        return Err("legacy mission checkpoint cannot restore full organism state".into());
    }
    let mission_id = cmd
        .mission_id
        .ok_or_else(|| "mission_id UUID is required for checkpoint restoration".to_string())?;
    ecosystem.set_mission_id(mission_id);
    Ok(())
}

pub fn handle_rhizome(cmd: &RhizomeCmd) -> Result<(), String> {
    match &cmd.subcommand {
        Some(RhizomeSubcommands::Serve { port, source }) => {
            if source.simulate {
                return rhizome_telemetry::run_simulation(*port);
            }
            rhizome_telemetry::live_server::run(*port, live_source(source)?)
        }
        Some(RhizomeSubcommands::Export {
            output,
            force,
            parents,
            source,
        }) => {
            let opts = crate::commands::output_guard::WriteOptions {
                force: *force,
                parents: *parents,
            };
            if source.simulate {
                rhizome_telemetry::export_snapshot(output, &opts)?;
            } else {
                rhizome_telemetry::export_live(&live_source(source)?, output, &opts)?;
            }
            println!(
                "{}",
                json!({"success":true, "operation":"rhizome_graph_export", "file":output,
                "source": if source.simulate { "simulation" } else { "backend" }})
            );
            Ok(())
        }
        None => rhizome_telemetry::run(4790),
    }
}

fn live_source(
    source: &crate::args::rhizome::RhizomeSource,
) -> Result<rhizome_telemetry::live_source::LiveSource, String> {
    Ok(rhizome_telemetry::live_source::LiveSource {
        session: source
            .session_id
            .clone()
            .ok_or("--session-id is required for live telemetry")?,
        database: source
            .database
            .clone()
            .ok_or("--database is required for live telemetry")?,
    })
}
