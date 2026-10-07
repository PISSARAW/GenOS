use std::fs;
use std::path::{Component, Path, PathBuf};
use serde_json::json;
use crate::args::PlatformSubcommands;
use super::output_guard::WriteOptions;
pub fn execute(cmd: crate::args::PlatformSubcommands) -> Result<(), String> {
    match cmd {
        crate::args::PlatformSubcommands::Ingest { document, index } => super::platform_ops::handle_ingest(&document, &index),
        crate::args::PlatformSubcommands::Search { query, index } => super::platform_ops::handle_search(&query, &index),
    }
}


pub fn handle_cost_accounting(agent_id: &str, timeframe: Option<&str>) -> Result<(), String> {
    crate::commands::accounting::handle_cost_accounting(agent_id, timeframe)
}

fn validate_trinity_mission_id(mission_id: &str) -> Result<(), String> {
    // The mission id becomes a directory name; reject anything that could
    // escape the trinity root (path separators, traversal, drive letters).
    if mission_id.is_empty()
        || !mission_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
    {
        return Err("mission_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    Ok(())
}

pub fn handle_trinity(mission_id: &str, strategies: &str) -> Result<(), String> {
    validate_trinity_mission_id(mission_id)?;
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
    if super::platform_ops::has_parent_component(parsed) {
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
