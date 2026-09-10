use serde_json::json;

pub fn handle(mode: &str, mission: &str) -> Result<(), String> {
    let mode = mode.trim().to_ascii_lowercase();
    let roles = match mode.as_str() {
        "biome" => ["environment_mapper", "resource_steward", "population_specialist", "ecosystem_observer"],
        "syncytium" => ["shared_state_coordinator", "parallel_executor", "consistency_guardian", "integration_executor"],
        "holobionte" => ["host_orchestrator", "specialist_symbiont", "immune_symbiont", "memory_symbiont"],
        "biocenose" => ["community_facilitator", "independent_solver", "adversarial_reviewer", "consensus_observer"],
        "rhizome" => ["rootless_coordinator", "capability_offshoot", "local_bridge", "boundary_scout"],
        "metapopulation" => ["population_isolator", "quorum_sensor", "synaptic_adaptor", "regeneration_steward"],
        _ => return Err("mode must be biome, syncytium, holobionte, biocenose, rhizome, or metapopulation".to_string()),
    };
    if mission.trim().is_empty() {
        return Err("mission must not be empty".to_string());
    }
    println!("{}", json!({
        "success": true,
        "operation": "biological_mode",
        "mode": mode,
        "mission": mission,
        "mechanisms": if mode == "metapopulation" { json!(["quorum_sensing", "synaptic_plasticity", "regeneration"]) } else { json!([]) },
        "members": roles.iter().enumerate().map(|(index, role)| json!({
            "member_number": index + 1,
            "role": role
        })).collect::<Vec<_>>()
    }));
    Ok(())
}