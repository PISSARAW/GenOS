use std::path::{Path, PathBuf};

/// Resolves the unified data directory root for GenOS CLI operations.
/// 
/// Resolves in order:
/// 1. `GENOS_STUDIO_ROOT` or `GENOS_ROOT` environment variables.
/// 2. If the current working directory itself is named `.genos-matrix` or `.genos`
///    (e.g., when spawned by Node.js studio with `cwd: ensureRoot()`), returns the CWD.
/// 3. If `.genos-matrix` exists in the current directory, returns `.genos-matrix`.
/// 4. If `.genos` exists in the current directory, returns `.genos`.
/// 5. Defaults to `.genos-matrix`.
pub fn resolve_matrix_root() -> PathBuf {
    if let Ok(env_root) = std::env::var("GENOS_STUDIO_ROOT").or_else(|_| std::env::var("GENOS_ROOT")) {
        if !env_root.trim().is_empty() {
            return PathBuf::from(env_root.trim());
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(name) = current_dir.file_name().and_then(|s| s.to_str()) {
            if name == ".genos-matrix" || name == ".genos" {
                return current_dir;
            }
        }
    }

    if Path::new(".genos-matrix").exists() {
        PathBuf::from(".genos-matrix")
    } else if Path::new(".genos").exists() {
        PathBuf::from(".genos")
    } else {
        PathBuf::from(".genos-matrix")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_matrix_root_env() {
        unsafe {
            std::env::set_var("GENOS_STUDIO_ROOT", ".genos-custom-studio");
        }
        let resolved = resolve_matrix_root();
        assert_eq!(resolved, PathBuf::from(".genos-custom-studio"));
        unsafe {
            std::env::remove_var("GENOS_STUDIO_ROOT");
        }
    }
}
