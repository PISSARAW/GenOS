use std::path::Component;
use std::path::Path;
use std::path::PathBuf;

pub struct WriteOptions {
    pub force: bool,
    pub parents: bool,
}

pub fn opts(force: bool, parents: bool) -> WriteOptions {
    WriteOptions { force, parents }
}

fn has_dotdot(out: &str) -> bool {
    for component in Path::new(out).components() {
        if matches!(component, Component::ParentDir) {
            return true;
        }
    }
    false
}

fn absolute_display(out: &str) -> String {
    let path = Path::new(out);
    if path.is_absolute() {
        return path.display().to_string();
    }
    let cwd = match std::env::current_dir() {
        Ok(valid) => valid,
        Err(_) => return out.to_string(),
    };
    cwd.join(path).display().to_string()
}

fn create_parents(parent: &Path) -> Result<(), String> {
    match std::fs::create_dir_all(parent) {
        Ok(()) => Ok(()),
        Err(error) => Err(format!("failed to create parent directories: {}", error)),
    }
}

fn ensure_parent(path: &Path, parents: bool) -> Result<(), String> {
    let parent = match path.parent() {
        Some(valid) => valid,
        None => return Ok(()),
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }
    if parent.exists() {
        return Ok(());
    }
    if parents {
        return create_parents(parent);
    }
    Err(format!("parent directory does not exist (use --parents to create it): {}", parent.display()))
}

fn check_exists(path: &Path, force: bool) -> Result<(), String> {
    if path.exists() {
        if force {
            return Ok(());
        }
        return Err(format!("refusing to overwrite existing file (use --force): {}", path.display()));
    }
    Ok(())
}

pub fn resolve_output_path(out: &str, opts: &WriteOptions) -> Result<PathBuf, String> {
    if out.is_empty() {
        return Err("output path must not be empty".to_string());
    }
    if has_dotdot(out) {
        return Err(format!("refusing output path with '..': {}", absolute_display(out)));
    }
    let path = PathBuf::from(out);
    match check_exists(&path, opts.force) {
        Ok(()) => match ensure_parent(&path, opts.parents) {
            Ok(()) => Ok(path),
            Err(reason) => Err(reason),
        },
        Err(reason) => Err(reason),
    }
}

pub fn write_output_file(out: &str, content: &str, opts: &WriteOptions) -> Result<(), String> {
    let path = match resolve_output_path(out, opts) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    match std::fs::write(&path, content) {
        Ok(()) => Ok(()),
        Err(error) => Err(format!("failed to write '{}': {}", absolute_display(out), error)),
    }
}

#[cfg(test)]
mod guard_tests {
    use super::WriteOptions;
    use super::resolve_output_path;
    use super::write_output_file;

    #[test]
    fn refuses_dotdot_path() {
        let opts = WriteOptions { force: true, parents: true };
        assert!(resolve_output_path("some/../evil.json", &opts).is_err());
    }

    #[test]
    fn refuses_existing_without_force() {
        let dir = std::env::temp_dir().join("genos_guard_noforce");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("kept.json");
        let _ = std::fs::write(&file, "old");
        let name = file.to_string_lossy().into_owned();
        let opts = WriteOptions { force: false, parents: false };
        assert!(resolve_output_path(&name, &opts).is_err());
    }

    #[test]
    fn force_overwrites_existing() {
        let dir = std::env::temp_dir().join("genos_guard_force");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("over.json");
        let _ = std::fs::write(&file, "old");
        let name = file.to_string_lossy().into_owned();
        let opts = WriteOptions { force: true, parents: false };
        assert!(write_output_file(&name, "new", &opts).is_ok());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "new");
    }

    #[test]
    fn missing_parent_without_flag_is_refused() {
        let dir = std::env::temp_dir().join("genos_guard_missing_parent_xyz");
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join("out.json");
        let name = file.to_string_lossy().into_owned();
        let opts = WriteOptions { force: true, parents: false };
        assert!(resolve_output_path(&name, &opts).is_err());
    }

    #[test]
    fn missing_parent_with_flag_is_created() {
        let dir = std::env::temp_dir().join("genos_guard_with_parent_xyz");
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join("out.json");
        let name = file.to_string_lossy().into_owned();
        let opts = WriteOptions { force: true, parents: true };
        assert!(write_output_file(&name, "data", &opts).is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
