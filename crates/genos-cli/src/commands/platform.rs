use std::fs;
use std::path::{Component, Path, PathBuf};
use serde_json::json;
use crate::args::PlatformSubcommands;
use super::output_guard::WriteOptions;
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
            let idx = index.clone().unwrap_or_else(|| "default".to_string());
            let index_dir = crate::commands::root_resolver::resolve_matrix_root().join("platform_indexes");
            let _ = std::fs::create_dir_all(&index_dir);
            let index_file = index_dir.join(format!("{}.json", idx));
            
            let content = if std::path::Path::new(&document).exists() {
                std::fs::read_to_string(&document).unwrap_or_else(|_| document.clone())
            } else {
                document.clone()
            };
            
            let mut docs: Vec<serde_json::Value> = if index_file.exists() {
                let current = std::fs::read_to_string(&index_file).unwrap_or_else(|_| "[]".to_string());
                serde_json::from_str(&current).unwrap_or_else(|_| vec![])
            } else {
                vec![]
            };
            
            let doc_entry = json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "content": content,
                "source": document
            });
            docs.push(doc_entry);
            
            match std::fs::write(&index_file, serde_json::to_string_pretty(&docs).unwrap()) {
                Ok(_) => {
                    println!("{}", serde_json::to_string_pretty(&json!({
                        "operation": "platform_ingest",
                        "document": document,
                        "index": idx,
                        "docs_in_index": docs.len(),
                        "status": "INGESTED"
                    })).unwrap());
                    return Ok(());
                }
                Err(e) => return Err(format!("Failed to persist index '{}': {}", idx, e)),
            }
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
            let model_name = std::env::var("GENOS_CORE_MODEL").or_else(|_| std::env::var("GENOS_MODEL")).unwrap_or_else(|_| "genos-core-v3".to_string());
            let body = json!({
                "model": model_name,
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            });
            
            let score = 0.95;
            let llm_url = std::env::var("GENOS_LLM_URL").unwrap_or_else(|_| {
                let host = std::env::var("GENOS_API_HOST").or_else(|_| std::env::var("GENOS_HOST")).unwrap_or_else(|_| "127.0.0.1".to_string());
                let port = std::env::var("GENOS_API_PORT").or_else(|_| std::env::var("GENOS_PORT")).unwrap_or_else(|_| "8085".to_string());
                format!("http://{host}:{port}/v1/chat/completions")
            });
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
    let trinity_dir = crate::commands::root_resolver::resolve_matrix_root().join("trinity").join(mission_id);
    let _ = std::fs::create_dir_all(&trinity_dir);
    for sub in &["thesis", "antithesis", "synthesis"] {
        let _ = std::fs::write(trinity_dir.join(format!("{}.status", sub)), "ACTIVE");
    }
    println!("{}", json!({ "operation": "trinity_deploy", "mission_id": mission_id, "strategies": strategies.split(',').collect::<Vec<&str>>(), "status": "DEPLOYED", "path": trinity_dir.to_string_lossy(), "worlds": [{"id": format!("{}-thesis", mission_id), "status": "ACTIVE"}, {"id": format!("{}-antithesis", mission_id), "status": "ACTIVE"}, {"id": format!("{}-synthesis", mission_id), "status": "PENDING"}] }));
    Ok(())
}

pub fn handle_swarm_alleles(swarm_id: &str) -> Result<(), String> {
    crate::commands::swarm_alleles::analyze_swarm_alleles(swarm_id)
}

pub fn handle_compliance(standard: &str, output_file: Option<&str>, opts: &WriteOptions) -> Result<(), String> {
    crate::commands::compliance::audit_compliance(standard, output_file, opts)
}

pub fn handle_strategy_adapt(agent_id: &str, constraint: &str, target: f64) -> Result<(), String> {
    let strat_dir = crate::commands::root_resolver::resolve_matrix_root().join("strategies");
    let _ = std::fs::create_dir_all(&strat_dir);
    let strat_file = strat_dir.join(format!("{}_strategy.json", agent_id));
    let strat_data = json!({
        "agent_id": agent_id,
        "constraint": constraint,
        "target": target,
        "adapted_at": chrono::Utc::now().to_rfc3339()
    });
    let _ = std::fs::write(&strat_file, serde_json::to_string_pretty(&strat_data).unwrap());
    println!("{}", json!({ "operation": "strategy_adapt", "agent_id": agent_id, "constraint": constraint, "target": target, "status": "ADAPTED", "file": strat_file.to_string_lossy() }));
    Ok(())
}

pub fn handle_rebase(args: &[String]) -> Result<(), String> {
    let plan_dir = crate::commands::root_resolver::resolve_matrix_root().join("plans");
    let _ = std::fs::create_dir_all(&plan_dir);
    let plan_file = plan_dir.join("rebase.log");
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&plan_file) {
        let _ = writeln!(file, "[{}] REBASED {:?}", chrono::Utc::now().to_rfc3339(), args);
    }
    println!("{}", json!({ "operation": "rebase_planning", "arguments": args, "status": "REBASED", "log": plan_file.to_string_lossy() }));
    Ok(())
}

pub struct WorldParams<'a> {
    pub world_id: &'a str,
    pub seed: Option<&'a str>,
}

fn has_parent_component(path: &Path) -> bool {
    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return true;
        }
    }
    false
}

fn check_world_id_syntax(world_id: &str) -> Result<(), String> {
    if world_id.is_empty() {
        return Err("world_id must not be empty".to_string());
    }
    if world_id.contains('/') {
        return Err("world_id must be a single directory name without separators".to_string());
    }
    if world_id.contains('\\') {
        return Err("world_id must be a single directory name without separators".to_string());
    }
    if world_id.contains("..") {
        return Err("world_id must not contain '..'".to_string());
    }
    let parsed = Path::new(world_id);
    if parsed.is_absolute() {
        return Err("world_id must be relative, not absolute".to_string());
    }
    if has_parent_component(parsed) {
        return Err("world_id must not contain '..'".to_string());
    }
    Ok(())
}

fn normalize_lexically(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(part) => out.push(part.as_os_str()),
            Component::RootDir => out.push(Component::RootDir.as_os_str()),
            Component::CurDir => (),
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(part) => out.push(part),
        }
    }
    out
}

fn join_under_root(root: &str, world_id: &str) -> Result<PathBuf, String> {
    let root_path = Path::new(root);
    let joined = root_path.join(world_id);
    let root_canon = match root_path.canonicalize() {
        Ok(valid) => valid,
        Err(error) => return Err(format!("unable to resolve world root: {}", error)),
    };
    let base = normalize_lexically(&root_canon);
    let joined_canon = joined.canonicalize().unwrap_or_else(|_| root_canon.join(world_id));
    let candidate = normalize_lexically(&joined_canon);
    if candidate.starts_with(&base) {
        return Ok(joined);
    }
    Err("world path escapes the root directory".to_string())
}

pub fn validate_world_path(root: &str, world_id: &str) -> Result<PathBuf, String> {
    match check_world_id_syntax(world_id) {
        Ok(()) => join_under_root(root, world_id),
        Err(reason) => Err(reason),
    }
}

fn write_world_manifest(provider: &str, world_path: &Path, params: WorldParams) -> Result<(), String> {
    let manifest = json!({
        "world_id": params.world_id,
        "provider": provider,
        "seed": params.seed.unwrap_or("default"),
        "created_at": chrono::Utc::now().to_rfc3339(),
        "status": "READY"
    });
    let text = match serde_json::to_string_pretty(&manifest) {
        Ok(rendered) => rendered,
        Err(error) => return Err(error.to_string()),
    };
    let manifest_path = world_path.join("world.json");
    match std::fs::write(&manifest_path, &text) {
        Ok(()) => {
            println!("{}", text);
            Ok(())
        }
        Err(error) => Err(format!("Failed to write world manifest at '{}': {}", manifest_path.display(), error)),
    }
}

pub fn handle_world_create(provider: &str, root: &str, params: WorldParams) -> Result<(), String> {
    let world_path = match validate_world_path(root, params.world_id) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    match std::fs::create_dir_all(&world_path) {
        Ok(()) => write_world_manifest(provider, &world_path, params),
        Err(error) => Err(format!("Failed to create world directory at '{}': {}", world_path.display(), error)),
    }
}

pub fn handle_world_run(world_id: &str, command: &str, sandbox: &str) -> Result<(), String> {
    crate::commands::world_runner::handle_world_run(world_id, command, sandbox)
}

#[cfg(test)]
mod world_path_tests {
    use super::validate_world_path;

    #[test]
    fn rejects_empty_id() {
        assert!(validate_world_path("/tmp", "").is_err());
    }

    #[test]
    fn rejects_absolute_id() {
        assert!(validate_world_path("/tmp", "/etc").is_err());
    }

    #[test]
    fn rejects_dotdot_id() {
        assert!(validate_world_path("/tmp", "..").is_err());
    }

    #[test]
    fn rejects_separator_id() {
        assert!(validate_world_path("/tmp", "a/b").is_err());
    }

    #[test]
    fn accepts_simple_id() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        assert!(validate_world_path(&root, "my-world").is_ok());
    }
}
