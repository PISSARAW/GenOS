use serde_json::json;
use crate::args::{BiologicalCmd, RhizomeCmd, RhizomeSubcommands};
use crate::commands::rhizome_sim;

pub fn handle(cmd: &BiologicalCmd) -> Result<(), String> {
    let mode = cmd.mode.trim().to_ascii_lowercase();

    if cmd.visualize {
        return rhizome_sim::run(cmd.gif.as_deref());
    }

    if let Some(gif_path) = &cmd.gif {
        rhizome_sim::generate_gif(gif_path)?;
        println!("{}", json!({
            "success": true,
            "operation": "rhizome_gif_export",
            "file": gif_path
        }));
        return Ok(());
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
        Some(RhizomeSubcommands::Visualize { gif }) => {
            rhizome_sim::run(gif.as_deref())
        }
        Some(RhizomeSubcommands::Gif { output }) => {
            rhizome_sim::generate_gif(output)?;
            println!("{}", json!({
                "success": true,
                "operation": "rhizome_gif_export",
                "file": output
            }));
            Ok(())
        }
        None => {
            rhizome_sim::run(Some("artifacts/rhizome_simulation.gif"))
        }
    }
}
