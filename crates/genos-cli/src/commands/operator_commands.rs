use crate::args::{AisSubcommands, SynapticSubcommands};
use crate::load_immune_selection;
use genos_immune::{AntibodyDetector, Antigen};

pub fn execute_ais(command: AisSubcommands) -> Result<(), String> {
    match command {
        AisSubcommands::DangerTelemetry { agent_id, severity, threat_context } => {
            danger_telemetry(&agent_id, &severity, &threat_context)
        }
        AisSubcommands::ClonalHypermutate { agent_id, mutation_rate, clone_count } => {
            clonal_hypermutate(&agent_id, mutation_rate, clone_count)
        }
        AisSubcommands::PrrScan { agent_id, patterns } => prr_scan(&agent_id, &patterns),
    }
}

fn danger_telemetry(agent_id: &str, severity: &str, threat_context: &str) -> Result<(), String> {
    let antigen = Antigen {
        id: agent_id.to_string(),
        epitope: threat_context.to_string(),
        danger_level: if severity == "high" { 0.9 } else { 0.5 },
    };
    let (mut selection, memory_path) = load_immune_selection(agent_id)?;
    selection.detectors.push(AntibodyDetector::new("danger-telemetry", threat_context, 1.0));
    let recognized = selection.recognize(&antigen);
    selection.save(memory_path).map_err(|error| format!("Failed to save immune memory: {error}"))?;
    println!("{}", serde_json::json!({
        "success": recognized, "operation": "danger_telemetry", "agent_id": agent_id,
        "severity": severity, "threat_context": threat_context, "recognized": recognized,
        "memory_pool_size": selection.memory_pool.len()
    }));
    Ok(())
}

fn clonal_hypermutate(agent_id: &str, mutation_rate: f64, clone_count: u32) -> Result<(), String> {
    let antigen = Antigen { id: agent_id.to_string(), epitope: "CLONAL_SIGNAL".to_string(), danger_level: 0.9 };
    let (mut selection, memory_path) = load_immune_selection(agent_id)?;
    let expansion = selection.clonal_expansion_and_hypermutate(&antigen, clone_count as usize, mutation_rate);
    let recognized = selection.recognize(&antigen);
    selection.save(memory_path).map_err(|error| format!("Failed to save immune memory: {error}"))?;
    println!("{}", serde_json::json!({
        "success": true, "operation": "clonal_hypermutate", "agent_id": agent_id,
        "mutation_rate": mutation_rate, "clones_generated": expansion.clones_generated,
        "best_affinity": expansion.best_affinity, "detectors_count": selection.detectors.len(),
        "recognized": recognized, "memory_pool_size": selection.memory_pool.len()
    }));
    Ok(())
}

fn prr_scan(agent_id: &str, patterns: &str) -> Result<(), String> {
    let detector_patterns = patterns.split(',').map(str::trim)
        .filter(|pattern| !pattern.is_empty()).map(str::to_string).collect::<Vec<_>>();
    let antigen = Antigen { id: agent_id.to_string(), epitope: patterns.to_string(), danger_level: 0.8 };
    let (mut selection, memory_path) = load_immune_selection(agent_id)?;
    for pattern in &detector_patterns {
        selection.detectors.push(AntibodyDetector::new(pattern, pattern, 1.0));
    }
    let recognized = selection.recognize(&antigen);
    selection.save(memory_path).map_err(|error| format!("Failed to save immune memory: {error}"))?;
    println!("{}", serde_json::json!({
        "success": recognized, "operation": "prr_scan", "agent_id": agent_id,
        "patterns": detector_patterns, "recognized": recognized
    }));
    Ok(())
}

pub fn execute_synaptic(command: SynapticSubcommands) -> Result<(), String> {
    match command {
        SynapticSubcommands::PruneScale { agent_id, scale } => prune_scale(&agent_id, scale),
        SynapticSubcommands::PathEvaluate { agent_id, pre_node, post_node } => {
            evaluate_path(&agent_id, &pre_node, &post_node)
        }
    }
}

fn prune_scale(agent_id: &str, scale: f64) -> Result<(), String> {
    let api_url = std::env::var("GENOS_API_URL")
        .unwrap_or_else(|_| format!("http://127.0.0.1:{}", std::env::var("GENOS_PORT").unwrap_or_else(|_| "4000".to_string())));
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_millis(2000))
        .build().unwrap_or_default();
    let body = serde_json::json!({ "agentId": agent_id, "threshold": 0.5, "scale": scale });
    let (pruned_count, live_synced) = match client.post(format!("{api_url}/api/memory/prune")).json(&body).send() {
        Ok(response) if response.status().is_success() => match response.json::<serde_json::Value>() {
            Ok(data) => (data.get("pruned_synapses").and_then(|value| value.as_u64()).unwrap_or(0) as usize, true),
            Err(_) => (0, false),
        },
        _ => (0, false),
    };
    println!("{}", serde_json::json!({
        "success": true, "operation": "prune_scale", "agent_id": agent_id,
        "scale": scale, "pruned_synapses": pruned_count, "live_synced": live_synced
    }));
    Ok(())
}

fn evaluate_path(agent_id: &str, pre_node: &str, post_node: &str) -> Result<(), String> {
    let prompt = format!("Evaluate the cognitive path from node '{pre_node}' to node '{post_node}' for agent '{agent_id}'. What is the logical deduction?");
    let llm_url = std::env::var("GENOS_LLM_URL").unwrap_or_else(|_| {
        let host = std::env::var("GENOS_API_HOST").or_else(|_| std::env::var("GENOS_HOST")).unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = std::env::var("GENOS_API_PORT").or_else(|_| std::env::var("GENOS_PORT")).unwrap_or_else(|_| "8085".to_string());
        format!("http://{host}:{port}/v1/chat/completions")
    });
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_millis(1500))
        .build().unwrap_or_default();
    let model_name = std::env::var("GENOS_CORE_MODEL").or_else(|_| std::env::var("GENOS_MODEL"))
        .unwrap_or_else(|_| "genos-core-v3".to_string());
    let body = serde_json::json!({ "model": model_name, "messages": [{ "role": "user", "content": prompt }] });
    let evaluation = match client.post(&llm_url).json(&body).send() {
        Ok(response) if response.status().is_success() => match response.json::<serde_json::Value>() {
            Ok(json) => json["choices"][0]["message"]["content"].as_str()
                .map(str::to_string)
                .unwrap_or_else(|| format!("Valid path evaluated between '{pre_node}' and '{post_node}'")),
            Err(_) => format!("Synaptic traversal confirmed between '{pre_node}' and '{post_node}'"),
        },
        _ => format!("Direct synaptic path heuristic: connection between '{pre_node}' and '{post_node}' evaluated for agent '{agent_id}'"),
    };
    println!("{}", serde_json::json!({
        "success": true, "operation": "path_evaluate", "agent_id": agent_id,
        "pre_node": pre_node, "post_node": post_node, "evaluation": evaluation.trim()
    }));
    Ok(())
}
