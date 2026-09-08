use std::fs;
use std::path::{Component, Path, PathBuf};
use serde_json::json;
use crate::args::PlatformSubcommands;
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
            return Err(format!("Platform ingestion is unavailable: document '{}' was not persisted to index '{}'.", document, index.unwrap_or_else(|| "default".to_string())));
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
            
            let score = 0.95;
            let llm_url = std::env::var("GENOS_LLM_URL")
                .or_else(|_| std::env::var("GENOS_PORT").map(|p| format!("http://127.0.0.1:{}/v1/chat/completions", p)))
                .unwrap_or_else(|_| "http://127.0.0.1:8085/v1/chat/completions".to_string());
            let response = client.post(&llm_url).json(&body).send()
                .map_err(|error| format!("Platform search API unavailable: {}. Is the GenOS server running?", error))?;
            if !response.status().is_success() {
                return Err(format!("Platform search API returned HTTP {}.", response.status()));
            }
            let json_resp = response.json::<serde_json::Value>()
                .map_err(|error| format!("Platform search API returned invalid JSON: {}", error))?;
            let result_content = json_resp["choices"][0]["message"]["content"].as_str()
                .ok_or_else(|| format!("Platform search API returned no assistant content: {}", json_resp))?;

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
    crate::commands::accounting::handle_cost_accounting(agent_id, timeframe)
}

pub fn handle_trinity(mission_id: &str, strategies: &str) -> Result<(), String> {
    Err(format!("Trinity deployment is unavailable: mission '{}' and strategies '{}' were not deployed.", mission_id, strategies))
}

pub fn handle_swarm_alleles(swarm_id: &str) -> Result<(), String> {
    crate::commands::swarm_alleles::analyze_swarm_alleles(swarm_id)
}

pub fn handle_compliance(standard: &str, output_file: Option<&str>) -> Result<(), String> {
    crate::commands::compliance::audit_compliance(standard, output_file)
}

pub fn handle_strategy_adapt(agent_id: &str, constraint: &str, target: f64) -> Result<(), String> {
    Err(format!("Strategy adaptation is unavailable: no persisted strategy executor is wired for agent '{}' (constraint '{}', target {}).", agent_id, constraint, target))
}

pub fn handle_rebase(args: &[String]) -> Result<(), String> {
    Err(format!("Rebase planning is unavailable: no repository-backed planner is wired for arguments {:?}.", args))
}

pub struct WorldParams<'a> {
    pub world_id: &'a str,
    pub seed: Option<&'a str>,
}

pub fn handle_world_create(provider: &str, root: &str, params: WorldParams) -> Result<(), String> {
    Err(format!("World creation is unavailable: provider '{}' has no persisted world backend for '{}' at '{}'.", provider, params.world_id, root))
}

pub fn handle_world_run(world_id: &str, command: &str, sandbox: &str) -> Result<(), String> {
    crate::commands::world_runner::handle_world_run(world_id, command, sandbox)
}
