use std::env;
use std::path::{Path, PathBuf};

fn find_in_env() -> Option<PathBuf> {
    env::var("GENOS_BIN").ok().map(PathBuf::from).filter(|path| {
        path.is_file() && !path.to_string_lossy().to_ascii_lowercase().contains("program files")
    })
}

fn find_near_current_exe(exe_name: &str) -> Option<PathBuf> {
    let current = env::current_exe().ok()?;
    let candidate = current.with_file_name(exe_name);
    if candidate.is_file() { return Some(candidate); }
    let repo_root = current.parent()?.parent()?.parent()?;
    for subdirectory in &["target/release", "target/debug"] {
        let candidate = repo_root.join(subdirectory).join(exe_name);
        if candidate.is_file() { return Some(candidate); }
    }
    None
}

fn find_in_workspace(workspace: &Path, exe_name: &str) -> Option<PathBuf> {
    for subdirectory in &[
        "target/debug", "target/release", "../target/debug",
        "../target/release", "../../target/debug", "../../target/release",
    ] {
        let candidate = workspace.join(subdirectory).join(exe_name);
        if candidate.is_file() { return Some(candidate); }
    }
    None
}

pub(super) fn find_binary(workspace: &Path) -> Option<PathBuf> {
    if let Some(path) = find_in_env() { return Some(path); }
    let exe_name = if cfg!(windows) { "genos.exe" } else { "genos" };
    find_near_current_exe(exe_name).or_else(|| find_in_workspace(workspace, exe_name))
}

pub(super) fn resolve_bridge_path(workspace: &Path) -> PathBuf {
    if let Ok(value) = env::var("GENOS_ORCHESTRATOR_BRIDGE") {
        let path = PathBuf::from(value);
        let normalized = path.to_string_lossy().to_ascii_lowercase();
        if path.is_file() && !normalized.contains("program files") { return path; }
    }
    let local = workspace.join("backend/bin/genos-orchestrate.cjs");
    if local.is_file() { return local; }
    if let Ok(current) = env::current_exe() {
        if let Some(parent) = current.parent() {
            if let Some(repo_root) = parent.parent().and_then(|path| path.parent()) {
                let candidate = repo_root.join("backend/bin/genos-orchestrate.cjs");
                if candidate.is_file() { return candidate; }
            }
            let candidate = parent.join("backend/bin/genos-orchestrate.cjs");
            if candidate.is_file() { return candidate; }
        }
    }
    local
}
