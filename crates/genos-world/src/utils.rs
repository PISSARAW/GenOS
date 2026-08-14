//! Internal helpers shared by the world providers.
//!
//! Kept in a private module so neither provider has to depend on the other
//! just to copy a directory or run a command.

use crate::ExecuteResult;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tokio::process::Command;

use crate::WorldError;

/// Join `relative_path` onto `world_path`, refusing anything that would leave
/// the world: absolute paths, drive prefixes and `..` components.
///
/// World isolation is the invariant the whole system rests on, so a path coming
/// from a caller is never allowed to address a sibling world by walking up.
pub fn resolve_world_relative_path(
    world_path: &Path,
    relative_path: &str,
) -> anyhow::Result<PathBuf> {
    let invalid = |reason: &str| WorldError::InvalidWorldPath {
        path: relative_path.to_string(),
        reason: reason.to_string(),
    };

    if relative_path.trim().is_empty() {
        return Err(invalid("path is empty").into());
    }

    let mut has_name = false;
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(_) => has_name = true,
            Component::CurDir => {}
            Component::ParentDir => return Err(invalid("'..' escapes the world").into()),
            Component::RootDir | Component::Prefix(_) => {
                return Err(invalid("path is absolute").into())
            }
        }
    }

    if !has_name {
        return Err(invalid("path names no file").into());
    }

    Ok(world_path.join(relative_path))
}

pub(crate) fn copy_directory_recursive(from: &Path, to: &Path) -> anyhow::Result<()> {
    if !from.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = to.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            fs::create_dir_all(&dst_path)?;
            copy_directory_recursive(&src_path, &dst_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

/// Walks a world tree and collects one entry per file. Built around a small
/// builder so callers do not have to thread the same root through every
/// recursive call.
pub struct FileCollector {
    root: PathBuf,
    out: HashMap<PathBuf, String>,
}

impl FileCollector {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            out: HashMap::new(),
        }
    }

    /// Walk every file under `current`, hashing each one and storing its
    /// path relative to the root. A `.git` directory is skipped so a
    /// worktree's metadata does not pollute the diff.
    pub fn collect(&mut self, current: &Path) -> anyhow::Result<()> {
        for entry in fs::read_dir(current)? {
            let entry = entry?;
            let path = entry.path();
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                    continue;
                }
                self.collect(&path)?;
            } else if file_type.is_file() {
                let bytes = fs::read(&path)?;
                let mut hasher = Sha256::new();
                hasher.update(bytes);
                let hash = format!("{:x}", hasher.finalize());
                let rel = path.strip_prefix(&self.root)?.to_path_buf();
                self.out.insert(rel, hash);
            }
        }
        Ok(())
    }

    pub fn into_map(self) -> HashMap<PathBuf, String> {
        self.out
    }
}

pub(crate) fn collect_files_with_hashes(
    root: &Path,
) -> anyhow::Result<HashMap<PathBuf, String>> {
    let mut collector = FileCollector::new(root.to_path_buf());
    collector.collect(root)?;
    Ok(collector.into_map())
}

pub(crate) fn count_files(root: &Path) -> anyhow::Result<usize> {
    Ok(collect_files_with_hashes(root)?.len())
}

pub(crate) async fn execute_command_in_dir(
    path: &Path,
    command: &str,
) -> anyhow::Result<ExecuteResult> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-lc").arg(command);
        c
    };

    let output = cmd.current_dir(path).output().await?;
    Ok(ExecuteResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

pub async fn run_git(repo: &Path, args: &[&str]) -> anyhow::Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(anyhow::anyhow!(
            "git command failed: git -C {} {}\nstderr: {}",
            repo.display(),
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}
