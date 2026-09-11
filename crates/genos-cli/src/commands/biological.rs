use serde_json::json;
use crate::args::{BiologicalCmd, RhizomeCmd, RhizomeSubcommands};
use crate::commands::{rhizome_telemetry, syncytium_crdt};

pub fn handle(cmd: &BiologicalCmd) -> Result<(), String> {
    let mode = cmd.mode.trim().to_ascii_lowercase();

    if cmd.serve {
        if mode == "syncytium" {
            return syncytium_crdt::run(cmd.port, &cmd.mission);
        }
        return rhizome_telemetry::run(cmd.port);
    }

    let roles = match mode.as_str() {
        "biome" => ["environment_mapper", "resource_steward", "population_specialist", "ecosystem_observer"],
        "syncytium" => ["shared_state_coordinator", "parallel_executor", "consistency_guardian", "integration_executor"],
        "holobionte" => ["host_orchestrator", "specialist_symbiont", "immune_symbiont", "memory_symbiont"],
        "biocenose" => ["community_facilitator", "independent_solver", "adversarial_reviewer", "consensus_observer"],
        "rhizome" => ["rootless_coordinator", "capability_offshoot", "local_bridge", "boundary_scout"],
        "metapopulation" => ["population_isolator", "quorum_sensor", "synaptic_adaptor", "regeneration_steward"],
        _ => return Err("mode must be biome, syncytium, holobionte, biocenose, rhizome, or metapopulation".to_string()),
    };
    if cmd.mission.trim().is_empty() {
        return Err("mission must not be empty".to_string());
    }
    println!("{}", json!({
        "success": true,
        "operation": "biological_mode",
        "mode": mode,
        "mission": cmd.mission,
        "mechanisms": if mode == "metapopulation" { json!(["quorum_sensing", "synaptic_plasticity", "regeneration"]) } else { json!([]) },
        "members": roles.iter().enumerate().map(|(index, role)| json!({
            "member_number": index + 1,
            "role": role
        })).collect::<Vec<_>>()
    }));
    Ok(())
}

pub fn handle_rhizome(cmd: &RhizomeCmd) -> Result<(), String> {
    match &cmd.subcommand {
        Some(RhizomeSubcommands::Serve { port }) => rhizome_telemetry::run(*port),
        Some(RhizomeSubcommands::Export { output, force, parents }) => {
            let opts = crate::commands::output_guard::WriteOptions { force: *force, parents: *parents };
            rhizome_telemetry::export_snapshot(output, &opts)?;
            println!("{}", json!({
                "success": true,
                "operation": "rhizome_graph_export",
                "file": output
            }));
            Ok(())
        }
        None => rhizome_telemetry::run(4790),
    }
}
