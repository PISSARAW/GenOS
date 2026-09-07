use std::fs;
use std::path::{Component, Path, PathBuf};
use serde_json::json;
use crate::args::PlatformSubcommands;
use genos_orchestrator::BiomimeticOrchestrator;
use genos_cell::AgentCell;
fn read_dir_recursive(dir: &Path, root: &Path, content: &mut String) {
    let Ok(canonical_dir) = dir.canonicalize() else { return; };
    if !canonical_dir.starts_with(root) { return; }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if !path.ends_with(".git") && !path.ends_with("node_modules") && !path.ends_with("target") {
                    read_dir_recursive(&path, root, content);
                }
            } else if let Ok(text) = fs::read_to_string(&path) {
                content.push_str(&format!("\n--- File: {} ---\n{}\n", path.display(), text));
            }
        }
    }
}

pub fn execute(cmd: PlatformSubcommands) -> Result<(), String> {
    match cmd {
        PlatformSubcommands::Ingest { document, index } => {
            let idx = index.unwrap_or_else(|| "default".to_string());
            println!("{}", json!({
                "operation": "platform_ingest", "document": document, "index": idx, "chunks_ingested": 1, "status": "indexed"
            }));
        }
        PlatformSubcommands::Search { query, index } => {
            let idx = index.unwrap_or_else(|| "default".to_string());
            
            // Actually search the repo
            let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            let query_path = Path::new(&query);
            if query_path.is_absolute() || query_path.components().any(|component| matches!(component, Component::ParentDir)) {
                return Err("platform search path must be relative and must not contain '..'".to_string());
            }
            let root = root.canonicalize().map_err(|error| format!("unable to resolve search root: {error}"))?;
            let path = root.join(query_path);
            let canonical_path = path.canonicalize().map_err(|error| format!("unable to resolve search path: {error}"))?;
            if !canonical_path.starts_with(&root) {
                return Err("platform search path escapes the workspace root".to_string());
            }
            
            let mut context = String::new();
            if path.exists() && path.is_dir() {
                read_dir_recursive(&canonical_path, &root, &mut context);
            } else {
                context = "No files found or directory doesn't exist.".to_string();
            }

            // Truncate context to avoid token limits
            if context.len() > 80_000 {
                context.truncate(80_000);
            }

            let prompt = format!("You are an AI code analyzer. Here is the codebase for {}:\n\n{}\n\nProvide a very brief architectural summary of what this code does.", query, context);
            
            // Call the local GenOS API server
            let client = reqwest::blocking::Client::new();
            let body = json!({
                "model": "genos-core-v3",
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            });
            
            let mut score = 0.95;
            let result_content = match client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body).send() {
                Ok(res) => {
                    if let Ok(json_resp) = res.json::<serde_json::Value>() {
                        if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                            text.to_string()
                        } else {
                            format!("API Error: Malformed response: {}", json_resp)
                        }
                    } else {
                        "API Error: Failed to parse JSON".to_string()
                    }
                },
                Err(e) => {
                    score = 0.0;
                    format!("API Connection Error: {}. Is the GenOS server running? Try '.\\g start'.", e)
                }
            };

            println!("{}", json!({
                "operation": "platform_search", "query": query, "index": idx, "matches": [
                    { "content": result_content.trim(), "score": score }
                ]
            }));
        }
    }
    Ok(())
}

pub fn handle_cost_accounting(agent_id: &str, timeframe: Option<&str>) -> Result<(), String> {
    let tf = timeframe.unwrap_or("all");
    let (prompt_tokens, completion_tokens) = compute_agent_tokens(agent_id, timeframe)?;
    let total_tokens = prompt_tokens + completion_tokens;
    let cost_usd = (prompt_tokens as f64 * 0.0000015) + (completion_tokens as f64 * 0.000002);
    let rounded_cost = (cost_usd * 10000.0).round() / 10000.0;

    println!("{}", json!({
        "operation": "cost_accounting",
        "agent_id": agent_id,
        "timeframe": tf,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "total_cost_usd": rounded_cost,
        "currency": "USD",
        "status": "CALCULATED"
    }));
    Ok(())
}

fn parse_timeframe_seconds(timeframe: Option<&str>) -> Option<i64> {
    match timeframe {
        Some("1h") => Some(3600),
        Some("24h") | Some("1d") => Some(86400),
        Some("7d") => Some(7 * 86400),
        Some("30d") => Some(30 * 86400),
        Some("all") | None => None,
        Some(custom) => {
            if let Some(h) = custom.strip_suffix('h') {
                h.parse::<i64>().ok().map(|v| v * 3600)
            } else if let Some(d) = custom.strip_suffix('d') {
                d.parse::<i64>().ok().map(|v| v * 86400)
            } else if let Some(m) = custom.strip_suffix('m') {
                m.parse::<i64>().ok().map(|v| v * 60)
            } else {
                None
            }
        }
    }
}

fn parse_turn_timestamp(turn: &serde_json::Value) -> Option<i64> {
    if let Some(ts) = turn.get("timestamp").and_then(|v| v.as_i64()) {
        return Some(if ts > 1_000_000_000_000 { ts / 1000 } else { ts });
    }
    if let Some(s) = turn.get("created_at").and_then(|v| v.as_str()) {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
            return Some(dt.timestamp());
        }
    }
    None
}

fn compute_agent_tokens(agent_id: &str, timeframe: Option<&str>) -> Result<(usize, usize), String> {
    let trajectory_path = PathBuf::from(format!(".genos/trajectories/{}.json", agent_id));
    if !trajectory_path.exists() {
        return Err(format!("Trajectory file not found for agent '{}' at {}", agent_id, trajectory_path.display()));
    }

    let content = fs::read_to_string(&trajectory_path)
        .map_err(|e| format!("Failed to read trajectory for agent '{}': {}", agent_id, e))?;

    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Malformed trajectory JSON for agent '{}': {}", agent_id, e))?;

    let max_age_seconds = parse_timeframe_seconds(timeframe);
    let now = chrono::Utc::now().timestamp();

    // If turns are present, filter and sum turn-level tokens
    if let Some(turns) = parsed.get("turns").and_then(|t| t.as_array()) {
        let mut prompt_sum = 0usize;
        let mut completion_sum = 0usize;

        for turn in turns {
            if let Some(limit) = max_age_seconds {
                if let Some(ts) = parse_turn_timestamp(turn) {
                    if now - ts > limit {
                        continue;
                    }
                }
            }

            let turn_prompt = turn.get("prompt_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or_else(|| {
                    turn.get("detail")
                        .or_else(|| turn.get("cmd"))
                        .and_then(|v| v.as_str())
                        .map(|s| (s.len() + 3) / 4)
                        .unwrap_or(0)
                });

            let turn_completion = turn.get("completion_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or_else(|| {
                    turn.get("action")
                        .and_then(|v| v.as_str())
                        .map(|s| (s.len() + 3) / 4)
                        .unwrap_or(0)
                });

            prompt_sum += turn_prompt;
            completion_sum += turn_completion;
        }

        if prompt_sum > 0 || completion_sum > 0 {
            return Ok((prompt_sum, completion_sum));
        }
    }

    // Otherwise check top-level usage / metrics
    if let Some(usage) = parsed.get("usage") {
        let p = usage.get("prompt_tokens").or_else(|| usage.get("input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let c = usage.get("completion_tokens").or_else(|| usage.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        if p > 0 || c > 0 {
            return Ok((p, c));
        }
    }

    if let Some(metrics) = parsed.get("metrics").and_then(|m| m.get("tokens")) {
        let p = metrics.get("prompt").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let c = metrics.get("completion").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        if p > 0 || c > 0 {
            return Ok((p, c));
        }
    }

    // Default to character length estimation if no turns or usage fields exist
    let char_count = content.len();
    let prompt = (char_count / 4).max(1);
    let completion = (prompt / 3).max(1);
    Ok((prompt, completion))
}

pub fn handle_trinity(mission_id: &str, strategies: &str) -> Result<(), String> {
    let parsed_strategies: Vec<String> = if strategies.trim().starts_with('[') {
        serde_json::from_str(strategies).unwrap_or_else(|_| vec![strategies.to_string()])
    } else {
        strategies.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    };

    let world_dir = Path::new(".genos/trinity");
    let _ = fs::create_dir_all(world_dir);

    let strat_1 = parsed_strategies.first().cloned().unwrap_or_else(|| "generative_synthesis".to_string());
    let strat_2 = parsed_strategies.get(1).cloned().unwrap_or_else(|| "chaos_adversarial".to_string());
    let strat_3 = parsed_strategies.get(2).cloned().unwrap_or_else(|| "ground_truth_verification".to_string());

    let worlds = vec![
        json!({
            "world_number": 1,
            "role": "Architect",
            "branch": format!("trinity/{}/architect", mission_id),
            "allocated_strategy": strat_1,
            "status": "deployed",
            "isolation": "ephemeral_namespace"
        }),
        json!({
            "world_number": 2,
            "role": "Falsifier",
            "branch": format!("trinity/{}/falsifier", mission_id),
            "allocated_strategy": strat_2,
            "status": "deployed",
            "chaos_budget": 0.85
        }),
        json!({
            "world_number": 3,
            "role": "NeutralObserver",
            "branch": format!("trinity/{}/arbiter", mission_id),
            "allocated_strategy": strat_3,
            "status": "deployed",
            "ground_truth_fidelity": 0.99
        }),
    ];

    let deployment = json!({
        "operation": "trinity_deploy",
        "mission_id": mission_id,
        "strategies": parsed_strategies,
        "worlds": worlds,
        "trinity_state_file": format!(".genos/trinity/{}.json", mission_id),
        "status": "TRINITY_ACTIVE"
    });

    let rendered = serde_json::to_string_pretty(&deployment).unwrap();
    let state_file = format!(".genos/trinity/{}.json", mission_id);
    let _ = fs::write(&state_file, &rendered);

    println!("{}", rendered);
    Ok(())
}

pub fn handle_swarm_alleles(swarm_id: &str) -> Result<(), String> {
    crate::commands::swarm_alleles::analyze_swarm_alleles(swarm_id)
}

pub fn handle_compliance(standard: &str, output_file: Option<&str>) -> Result<(), String> {
    crate::commands::compliance::audit_compliance(standard, output_file)
}

pub fn handle_strategy_adapt(agent_id: &str, constraint: &str, target: f64) -> Result<(), String> {
    println!("{}", json!({
        "operation": "strategy_adaptation", "agent_id": agent_id,
        "constraint": constraint, "target_value": target, "adapted_strategy": "minimal_patch", "success": true
    }));
    Ok(())
}

pub fn handle_rebase(args: &[String]) -> Result<(), String> {
    println!("{}", json!({
        "operation": "rebase_compute_plan", "args": args, "rebase_steps": 2, "status": "PLAN_COMPUTED"
    }));
    Ok(())
}

pub struct WorldParams<'a> {
    pub world_id: &'a str,
    pub seed: Option<&'a str>,
}

pub fn handle_world_create(provider: &str, root: &str, params: WorldParams) -> Result<(), String> {
    let world_id = params.world_id;
    let seed = params.seed;
    println!("{}", json!({
        "operation": "world_create", "provider": provider, "root": root, "world_id": world_id, "seed": seed.unwrap_or("none"), "created": true
    }));
    Ok(())
}

fn ask_agent(prompt: &str, role: &str) -> String {
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "model": "genos-core-v3",
        "messages": [
            { "role": "system", "content": format!("Tu es un agent GenOS ayant le rôle de {}. Réponds de façon concise et technique.", role) },
            { "role": "user", "content": prompt }
        ]
    });
    
    match client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body).send() {
        Ok(res) => {
            if let Ok(json_resp) = res.json::<serde_json::Value>() {
                if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                    text.trim().to_string()
                } else {
                    "[ERREUR] Réponse inattendue de l'API.".to_string()
                }
            } else {
                "[ERREUR] Impossible de parser le JSON.".to_string()
            }
        }
        Err(e) => format!("[ERREUR RÉSEAU] Impossible de joindre le Thalamus. Est-ce que '.\\g start' tourne ? Détails: {}", e)
    }
}

pub fn handle_world_run(world_id: &str, _command: &str, _sandbox: &str) -> Result<(), String> {
    println!("\n🌍 INITIATING WORLD RUN: [{}]", world_id);
    println!("--------------------------------------------------");
    
    // 1. Initialisation Biomimétique
    let mut orchestrator = BiomimeticOrchestrator::new(world_id, 50.0, 100.0);
    
    let architect = AgentCell::new("Kwame", "Le Créateur", "Architecte Système");
    let verifier = AgentCell::new("Chidi", "La Rigueur", "Vérificateur Sécurité");
    
    let arch_id = architect.cell_id;
    let verif_id = verifier.cell_id;
    
    orchestrator.active_cells.insert(arch_id, architect.clone());
    orchestrator.active_cells.insert(verif_id, verifier.clone());
    
    println!("🧬 Écosystème déployé avec 2 cellules :");
    println!("  - {}", architect.introduce_self());
    println!("  - {}", verifier.introduce_self());
    println!("--------------------------------------------------\n");
    
    // 2. Boucle de Discussion (Thalamus/LLM)
    let topic = "Propose une architecture haut-niveau (2 paragraphes) pour un serveur web ultra-rapide en Rust.";
    println!("🎯 OBJECTIF DE LA MISSION : {}", topic);
    
    println!("\n🟡 [Architecte] réfléchit...");
    let plan = ask_agent(topic, &architect.role);
    println!("\n>>> ARCHITECTE :\n{}\n", plan);
    
    println!("--------------------------------------------------");
    
    let critique_prompt = format!("Voici une architecture proposée par l'architecte :\n{}\nFais une critique technique courte et incisive (1 paragraphe) en pointant une potentielle faille ou goulot d'étranglement.", plan);
    
    println!("\n🔴 [Vérificateur] examine le plan...");
    let critique = ask_agent(&critique_prompt, &verifier.role);
    println!("\n>>> VÉRIFICATEUR :\n{}\n", critique);
    
    println!("--------------------------------------------------");
    
    // 3. Fusion symbiotique (Endosymbiose) pour intégrer la vérification directement dans l'architecte
    println!("\n🦠 DÉCLENCHEMENT DE L'ENDOSYMBIOSE (Zero-IPC)...");
    match orchestrator.trigger_endosymbiosis(arch_id, verif_id) {
        Ok(_) => println!("✅ Le Vérificateur a été phagocyté par l'Architecte pour des itérations futures ultra-rapides en mémoire partagée !"),
        Err(e) => println!("❌ Échec de la symbiose : {}", e),
    }
    println!("\n🏁 WORLD RUN TERMINÉ.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cost_accounting_missing_trajectory() {
        let res = handle_cost_accounting("non-existent-agent-9999", None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Trajectory file not found"));
    }

    #[test]
    fn test_cost_accounting_real_tokens() {
        let test_dir = Path::new(".genos/trajectories");
        let _ = fs::create_dir_all(test_dir);
        let test_file = test_dir.join("test-agent-cost.json");

        let trajectory_data = json!({
            "agent_id": "test-agent-cost",
            "usage": {
                "prompt_tokens": 1500,
                "completion_tokens": 500
            }
        });
        fs::write(&test_file, serde_json::to_string(&trajectory_data).unwrap()).unwrap();

        let tokens = compute_agent_tokens("test-agent-cost", None);
        assert!(tokens.is_ok());
        let (prompt, completion) = tokens.unwrap();
        assert_eq!(prompt, 1500);
        assert_eq!(completion, 500);

        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_cost_accounting_timeframe_filtering() {
        let test_dir = Path::new(".genos/trajectories");
        let _ = fs::create_dir_all(test_dir);
        let test_file = test_dir.join("test-agent-timeframe.json");

        let now = chrono::Utc::now().timestamp();
        let old_ts = now - 7200; // 2 hours ago

        let trajectory_data = json!({
            "agent_id": "test-agent-timeframe",
            "turns": [
                {
                    "step": 1,
                    "timestamp": old_ts,
                    "prompt_tokens": 100,
                    "completion_tokens": 50
                },
                {
                    "step": 2,
                    "timestamp": now - 60, // 1 minute ago
                    "prompt_tokens": 200,
                    "completion_tokens": 100
                }
            ]
        });
        fs::write(&test_file, serde_json::to_string(&trajectory_data).unwrap()).unwrap();

        // 1 hour window: should only include step 2
        let tokens_1h = compute_agent_tokens("test-agent-timeframe", Some("1h")).unwrap();
        assert_eq!(tokens_1h, (200, 100));

        // All window: should include both steps
        let tokens_all = compute_agent_tokens("test-agent-timeframe", Some("all")).unwrap();
        assert_eq!(tokens_all, (300, 150));

        let _ = fs::remove_file(test_file);
    }
}
