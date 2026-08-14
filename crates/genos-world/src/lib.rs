pub mod files;

pub use files::*;

use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;
use tokio::process::Command;

#[derive(Clone, Debug)]
pub struct WorldDiff {
    pub files_changed: usize,
}

#[derive(Clone, Debug)]
pub struct ExecuteResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DestroyOutcome {
    Destroyed,
    AlreadyAbsent,
}

#[derive(Debug, Error)]
pub enum WorldError {
    #[error("unknown world id {0}")]
    UnknownWorld(WorldId),
    #[error("unknown snapshot id {0}")]
    UnknownSnapshot(SnapshotId),
    #[error("partial fork failure: requested={requested}, created={created}, last_error={last_error}")]
    PartialFork {
        requested: u32,
        created: usize,
        last_error: String,
    },
    #[error("'{path}' is not a world-relative path: {reason}")]
    InvalidWorldPath { path: String, reason: String },
}

#[async_trait]
pub trait WorldProvider: Send + Sync {
    async fn create(&self, agent_id: AgentId, branch_id: BranchId) -> anyhow::Result<WorldId>;
    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId>;
    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId>;

    /// Filesystem root of a live world, or [`WorldError::UnknownWorld`].
    fn world_path(&self, world_id: &WorldId) -> anyhow::Result<PathBuf>;

    /// Read a world-relative file, or `None` when it does not exist in that
    /// world. Reads never cross the world boundary: see
    /// [`resolve_world_relative_path`].
    async fn read_file(
        &self,
        world_id: &WorldId,
        relative_path: &str,
    ) -> anyhow::Result<Option<String>> {
        let path = resolve_world_relative_path(&self.world_path(world_id)?, relative_path)?;
        if !path.is_file() {
            return Ok(None);
        }
        Ok(Some(fs::read_to_string(path)?))
    }

    /// Write a world-relative file, creating parent directories as needed. The
    /// write lands in that world only: forked worlds are separate copies, so
    /// neither the sibling nor the world it was forked from can observe it.
    async fn write_file(
        &self,
        world_id: &WorldId,
        relative_path: &str,
        contents: &str,
    ) -> anyhow::Result<()> {
        let path = resolve_world_relative_path(&self.world_path(world_id)?, relative_path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, contents)?;
        Ok(())
    }

    async fn fork_many(&self, snapshot_id: SnapshotId, count: u32) -> anyhow::Result<Vec<WorldId>> {
        let mut created = Vec::new();
        for _ in 0..count {
            match self.fork(snapshot_id.clone()).await {
                Ok(world_id) => created.push(world_id),
                Err(err) => {
                    return Err(WorldError::PartialFork {
                        requested: count,
                        created: created.len(),
                        last_error: err.to_string(),
                    }
                    .into());
                }
            }
        }
        Ok(created)
    }

    async fn diff(&self, a: WorldId, b: WorldId) -> anyhow::Result<WorldDiff>;
    async fn execute(&self, world_id: WorldId, command: &str) -> anyhow::Result<ExecuteResult>;
    async fn inspect(&self, world_id: WorldId) -> anyhow::Result<String>;
    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<DestroyOutcome>;
}

#[derive(Clone, Debug)]
pub struct DirectoryWorldProvider {
    root_dir: PathBuf,
    seed_dir: Option<PathBuf>,
}

impl DirectoryWorldProvider {
    pub fn new(root_dir: PathBuf, seed_dir: Option<PathBuf>) -> anyhow::Result<Self> {
        fs::create_dir_all(root_dir.join("worlds"))?;
        fs::create_dir_all(root_dir.join("snapshots"))?;
        Ok(Self { root_dir, seed_dir })
    }

    fn snapshot_path(&self, snapshot_id: &SnapshotId) -> anyhow::Result<PathBuf> {
        let path = self.root_dir.join("snapshots").join(&snapshot_id.0);
        if path.exists() {
            Ok(path)
        } else {
            Err(WorldError::UnknownSnapshot(snapshot_id.clone()).into())
        }
    }
}

#[async_trait]
impl WorldProvider for DirectoryWorldProvider {
    async fn create(&self, _agent_id: AgentId, _branch_id: BranchId) -> anyhow::Result<WorldId> {
        let world_id = WorldId::new();
        let world_path = self.root_dir.join("worlds").join(&world_id.0);
        fs::create_dir_all(&world_path)?;

        if let Some(seed) = &self.seed_dir {
            copy_directory_recursive(seed, &world_path)?;
        }

        Ok(world_id)
    }

    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId> {
        let world_path = self.world_path(&world_id)?;
        let snapshot_id = SnapshotId::new();
        let snapshot_path = self.root_dir.join("snapshots").join(&snapshot_id.0);
        fs::create_dir_all(&snapshot_path)?;
        copy_directory_recursive(&world_path, &snapshot_path)?;
        Ok(snapshot_id)
    }

    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId> {
        let snapshot_path = self.snapshot_path(&snapshot_id)?;

        let world_id = WorldId::new();
        let world_path = self.root_dir.join("worlds").join(&world_id.0);
        fs::create_dir_all(&world_path)?;
        copy_directory_recursive(&snapshot_path, &world_path)?;
        Ok(world_id)
    }

    fn world_path(&self, world_id: &WorldId) -> anyhow::Result<PathBuf> {
        let path = self.root_dir.join("worlds").join(&world_id.0);
        if path.exists() {
            Ok(path)
        } else {
            Err(WorldError::UnknownWorld(world_id.clone()).into())
        }
    }

    async fn diff(&self, a: WorldId, b: WorldId) -> anyhow::Result<WorldDiff> {
        let a_path = self.world_path(&a)?;
        let b_path = self.world_path(&b)?;
        let files_a = collect_files_with_hashes(&a_path)?;
        let files_b = collect_files_with_hashes(&b_path)?;

        let mut all_paths: HashSet<PathBuf> = HashSet::new();
        all_paths.extend(files_a.keys().cloned());
        all_paths.extend(files_b.keys().cloned());

        let files_changed = all_paths
            .iter()
            .filter(|p| files_a.get(*p) != files_b.get(*p))
            .count();

        Ok(WorldDiff { files_changed })
    }

    async fn execute(&self, world_id: WorldId, command: &str) -> anyhow::Result<ExecuteResult> {
        let path = self.world_path(&world_id)?;
        execute_command_in_dir(&path, command).await
    }

    async fn inspect(&self, world_id: WorldId) -> anyhow::Result<String> {
        let path = self.world_path(&world_id)?;
        let file_count = count_files(&path)?;
        Ok(format!(
            "provider=directory world_id={} path={} files={}",
            world_id,
            path.display(),
            file_count
        ))
    }

    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<DestroyOutcome> {
        let path = self.root_dir.join("worlds").join(&world_id.0);
        if path.exists() {
            fs::remove_dir_all(path)?;
            Ok(DestroyOutcome::Destroyed)
        } else {
            Ok(DestroyOutcome::AlreadyAbsent)
        }
    }
}

#[derive(Clone, Debug)]
pub struct GitWorktreeWorldProvider {
    root_dir: PathBuf,
    source_repo: PathBuf,
}

impl GitWorktreeWorldProvider {
    pub fn new(root_dir: PathBuf, source_repo: PathBuf) -> anyhow::Result<Self> {
        fs::create_dir_all(root_dir.join("worlds"))?;
        fs::create_dir_all(root_dir.join("snapshots"))?;
        Ok(Self {
            root_dir,
            source_repo,
        })
    }

    fn snapshot_file(&self, snapshot_id: &SnapshotId) -> PathBuf {
        self.root_dir
            .join("snapshots")
            .join(format!("{}.commit", snapshot_id.0))
    }

    fn read_snapshot_commit(&self, snapshot_id: &SnapshotId) -> anyhow::Result<String> {
        let file = self.snapshot_file(snapshot_id);
        if !file.exists() {
            return Err(WorldError::UnknownSnapshot(snapshot_id.clone()).into());
        }
        Ok(fs::read_to_string(file)?.trim().to_string())
    }
}

#[async_trait]
impl WorldProvider for GitWorktreeWorldProvider {
    async fn create(&self, _agent_id: AgentId, _branch_id: BranchId) -> anyhow::Result<WorldId> {
        let world_id = WorldId::new();
        let world_path = self.root_dir.join("worlds").join(&world_id.0);
        let branch_name = format!("genos-{}", world_id.0);
        let world_path_s = world_path.to_string_lossy().to_string();

        run_git(
            &self.source_repo,
            &["worktree", "add", "-b", &branch_name, &world_path_s],
        )
        .await?;

        Ok(world_id)
    }

    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId> {
        let world_path = self.world_path(&world_id)?;
        let commit = run_git(&world_path, &["rev-parse", "HEAD"]).await?;
        let snapshot_id = SnapshotId::new();
        fs::write(self.snapshot_file(&snapshot_id), commit.trim())?;
        Ok(snapshot_id)
    }

    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId> {
        let commit = self.read_snapshot_commit(&snapshot_id)?;

        let world_id = WorldId::new();
        let world_path = self.root_dir.join("worlds").join(&world_id.0);
        let world_path_s = world_path.to_string_lossy().to_string();

        run_git(
            &self.source_repo,
            &["worktree", "add", "--detach", &world_path_s, commit.as_str()],
        )
        .await?;

        Ok(world_id)
    }

    fn world_path(&self, world_id: &WorldId) -> anyhow::Result<PathBuf> {
        let path = self.root_dir.join("worlds").join(&world_id.0);
        if path.exists() {
            Ok(path)
        } else {
            Err(WorldError::UnknownWorld(world_id.clone()).into())
        }
    }

    async fn diff(&self, a: WorldId, b: WorldId) -> anyhow::Result<WorldDiff> {
        let a_path = self.world_path(&a)?;
        let b_path = self.world_path(&b)?;
        let files_a = collect_files_with_hashes(&a_path)?;
        let files_b = collect_files_with_hashes(&b_path)?;

        let mut all_paths: HashSet<PathBuf> = HashSet::new();
        all_paths.extend(files_a.keys().cloned());
        all_paths.extend(files_b.keys().cloned());

        let files_changed = all_paths
            .iter()
            .filter(|p| files_a.get(*p) != files_b.get(*p))
            .count();

        Ok(WorldDiff { files_changed })
    }

    async fn execute(&self, world_id: WorldId, command: &str) -> anyhow::Result<ExecuteResult> {
        let path = self.world_path(&world_id)?;
        execute_command_in_dir(&path, command).await
    }

    async fn inspect(&self, world_id: WorldId) -> anyhow::Result<String> {
        let path = self.world_path(&world_id)?;
        let commit = run_git(&path, &["rev-parse", "HEAD"]).await?;
        let file_count = count_files(&path)?;
        Ok(format!(
            "provider=git_worktree world_id={} path={} commit={} files={}",
            world_id,
            path.display(),
            commit.trim(),
            file_count
        ))
    }

    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<DestroyOutcome> {
        let path = self.root_dir.join("worlds").join(&world_id.0);
        if path.exists() {
            let path_s = path.to_string_lossy().to_string();
            run_git(
                &self.source_repo,
                &["worktree", "remove", "--force", &path_s],
            )
            .await?;
            Ok(DestroyOutcome::Destroyed)
        } else {
            Ok(DestroyOutcome::AlreadyAbsent)
        }
    }
}

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

fn copy_directory_recursive(from: &Path, to: &Path) -> anyhow::Result<()> {
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

fn collect_files_with_hashes(root: &Path) -> anyhow::Result<HashMap<PathBuf, String>> {
    let mut out = HashMap::new();
    collect_files_recursive(root, root, &mut out)?;
    Ok(out)
}

fn collect_files_recursive(
    root: &Path,
    current: &Path,
    out: &mut HashMap<PathBuf, String>,
) -> anyhow::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                continue;
            }
            collect_files_recursive(root, &path, out)?;
        } else if file_type.is_file() {
            let bytes = fs::read(&path)?;
            let mut hasher = Sha256::new();
            hasher.update(bytes);
            let hash = format!("{:x}", hasher.finalize());
            let rel = path.strip_prefix(root)?.to_path_buf();
            out.insert(rel, hash);
        }
    }
    Ok(())
}

fn count_files(root: &Path) -> anyhow::Result<usize> {
    let files = collect_files_with_hashes(root)?;
    Ok(files.len())
}

async fn execute_command_in_dir(path: &Path, command: &str) -> anyhow::Result<ExecuteResult> {
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

async fn run_git(repo: &Path, args: &[&str]) -> anyhow::Result<String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_file(path: &Path, value: &str) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, value)?;
        Ok(())
    }

    fn read_file(path: &Path) -> anyhow::Result<String> {
        Ok(fs::read_to_string(path)?)
    }

    #[tokio::test]
    async fn directory_provider_keeps_worlds_isolated() -> anyhow::Result<()> {
        let root = tempdir()?;
        let seed = root.path().join("seed");
        write_file(&seed.join("src/app.txt"), "base")?;

        let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
        let world_a = provider.create(AgentId::new(), BranchId::new()).await?;
        let world_b = provider.create(AgentId::new(), BranchId::new()).await?;

        let a_path = provider.world_path(&world_a)?;
        let b_path = provider.world_path(&world_b)?;

        write_file(&a_path.join("src/app.txt"), "strategy-a")?;
        write_file(&b_path.join("src/app.txt"), "strategy-b")?;

        let a = read_file(&a_path.join("src/app.txt"))?;
        let b = read_file(&b_path.join("src/app.txt"))?;

        assert_eq!(a, "strategy-a");
        assert_eq!(b, "strategy-b");
        assert_ne!(a, b);

        Ok(())
    }

    #[tokio::test]
    async fn directory_provider_fork_keeps_isolation() -> anyhow::Result<()> {
        let root = tempdir()?;
        let seed = root.path().join("seed");
        write_file(&seed.join("README.md"), "initial")?;

        let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        let snapshot = provider.snapshot(parent).await?;
        let children = provider.fork_many(snapshot, 2).await?;

        let child_a_path = provider.world_path(&children[0])?;
        let child_b_path = provider.world_path(&children[1])?;

        write_file(&child_a_path.join("README.md"), "child-a-change")?;
        write_file(&child_b_path.join("README.md"), "child-b-change")?;

        let child_a = read_file(&child_a_path.join("README.md"))?;
        let child_b = read_file(&child_b_path.join("README.md"))?;

        assert_eq!(child_a, "child-a-change");
        assert_eq!(child_b, "child-b-change");
        assert_ne!(child_a, child_b);

        Ok(())
    }

    #[tokio::test]
    async fn directory_provider_execute_keeps_branches_isolated() -> anyhow::Result<()> {
        let root = tempdir()?;
        let seed = root.path().join("seed");
        write_file(&seed.join("README.md"), "initial")?;

        let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        let snapshot = provider.snapshot(parent).await?;
        let children = provider.fork_many(snapshot, 2).await?;

        let cmd_a = if cfg!(windows) {
            "echo branch-a> marker.txt"
        } else {
            "printf 'branch-a' > marker.txt"
        };
        let cmd_b = if cfg!(windows) {
            "echo branch-b> marker.txt"
        } else {
            "printf 'branch-b' > marker.txt"
        };

        let out_a = provider.execute(children[0].clone(), cmd_a).await?;
        let out_b = provider.execute(children[1].clone(), cmd_b).await?;
        assert_eq!(out_a.exit_code, 0);
        assert_eq!(out_b.exit_code, 0);

        let a_path = provider.world_path(&children[0])?;
        let b_path = provider.world_path(&children[1])?;
        let a_marker = read_file(&a_path.join("marker.txt"))?.trim().to_string();
        let b_marker = read_file(&b_path.join("marker.txt"))?.trim().to_string();

        assert_eq!(a_marker, "branch-a");
        assert_eq!(b_marker, "branch-b");
        assert_ne!(a_marker, b_marker);

        Ok(())
    }

    #[tokio::test]
    async fn directory_provider_destroy_is_idempotent() -> anyhow::Result<()> {
        let root = tempdir()?;
        let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;
        let world = provider.create(AgentId::new(), BranchId::new()).await?;

        let first = provider.destroy(world.clone()).await?;
        let second = provider.destroy(world).await?;

        assert_eq!(first, DestroyOutcome::Destroyed);
        assert_eq!(second, DestroyOutcome::AlreadyAbsent);
        Ok(())
    }

    #[tokio::test]
    async fn git_worktree_provider_keeps_worlds_isolated() -> anyhow::Result<()> {
        if !git_available().await {
            return Ok(());
        }

        let root = tempdir()?;
        let repo = root.path().join("repo");
        fs::create_dir_all(&repo)?;
        write_file(&repo.join("service.txt"), "base")?;

        run_git(&repo, &["init"]).await?;
        run_git(&repo, &["config", "user.email", "genos@example.local"]).await?;
        run_git(&repo, &["config", "user.name", "GenOS Test"]).await?;
        run_git(&repo, &["add", "."]).await?;
        run_git(&repo, &["commit", "-m", "initial"]).await?;

        let provider = GitWorktreeWorldProvider::new(root.path().join("worktrees"), repo)?;
        let world_a = provider.create(AgentId::new(), BranchId::new()).await?;
        let world_b = provider.create(AgentId::new(), BranchId::new()).await?;

        let a_path = provider.world_path(&world_a)?;
        let b_path = provider.world_path(&world_b)?;

        write_file(&a_path.join("service.txt"), "world-a")?;
        write_file(&b_path.join("service.txt"), "world-b")?;

        let a = read_file(&a_path.join("service.txt"))?;
        let b = read_file(&b_path.join("service.txt"))?;

        assert_eq!(a, "world-a");
        assert_eq!(b, "world-b");
        assert_ne!(a, b);

        Ok(())
    }

    /// The case this file-level check exists for: one world holding
    /// `hello.txt = "hello"`, forked twice, each fork rewriting the file.
    #[tokio::test]
    async fn forked_worlds_write_the_same_file_differently() -> anyhow::Result<()> {
        let root = tempdir()?;
        let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        provider.write_file(&parent, "hello.txt", "hello").await?;

        let snapshot = provider.snapshot(parent.clone()).await?;
        let forks = provider.fork_many(snapshot.clone(), 2).await?;
        let (world_a, world_b) = (forks[0].clone(), forks[1].clone());

        // Both forks start from the parent's contents.
        assert_eq!(
            provider.read_file(&world_a, "hello.txt").await?.as_deref(),
            Some("hello")
        );
        assert_eq!(
            provider.read_file(&world_b, "hello.txt").await?.as_deref(),
            Some("hello")
        );

        provider.write_file(&world_a, "hello.txt", "bonjour").await?;
        provider.write_file(&world_b, "hello.txt", "hola").await?;

        assert_eq!(
            provider.read_file(&world_a, "hello.txt").await?.as_deref(),
            Some("bonjour")
        );
        assert_eq!(
            provider.read_file(&world_b, "hello.txt").await?.as_deref(),
            Some("hola")
        );
        assert_eq!(
            provider.read_file(&parent, "hello.txt").await?.as_deref(),
            Some("hello")
        );

        let report = check_file_isolation(
            &provider,
            "hello.txt",
            &WorldFileExpectation::holds(&parent, "hello"),
            &[
                WorldFileExpectation::holds(&world_a, "bonjour"),
                WorldFileExpectation::holds(&world_b, "hola"),
            ],
        )
        .await?;

        assert!(report.isolated, "{report:?}");
        assert!(report.parent_preserved);
        assert!(report.branches_hold_expected_contents);
        assert!(report.branch_contents_distinct);
        assert!(report.violations.is_empty());

        // The snapshot the forks came from is untouched too: a fork taken after
        // both writes still reads the original contents.
        let late_fork = provider.fork(snapshot).await?;
        assert_eq!(
            provider.read_file(&late_fork, "hello.txt").await?.as_deref(),
            Some("hello")
        );

        // Each pair differs by exactly the one file that diverged.
        assert_eq!(
            provider.diff(world_a.clone(), world_b.clone()).await?.files_changed,
            1
        );
        assert_eq!(provider.diff(parent, world_a).await?.files_changed, 1);

        Ok(())
    }

    #[tokio::test]
    async fn a_new_file_in_one_world_does_not_appear_in_the_others() -> anyhow::Result<()> {
        let root = tempdir()?;
        let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        provider.write_file(&parent, "hello.txt", "hello").await?;
        let snapshot = provider.snapshot(parent.clone()).await?;
        let forks = provider.fork_many(snapshot, 2).await?;

        provider
            .write_file(&forks[0], "notes/draft.txt", "only in A")
            .await?;

        let report = check_file_isolation(
            &provider,
            "notes/draft.txt",
            &WorldFileExpectation::absent(&parent),
            &[
                WorldFileExpectation::holds(&forks[0], "only in A"),
                WorldFileExpectation::absent(&forks[1]),
            ],
        )
        .await?;

        assert!(report.isolated, "{report:?}");
        assert_eq!(report.parent.actual_contents, None);
        assert_eq!(report.branches[1].actual_contents, None);

        Ok(())
    }

    #[tokio::test]
    async fn report_flags_a_write_that_reached_the_parent() -> anyhow::Result<()> {
        let root = tempdir()?;
        let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        provider.write_file(&parent, "hello.txt", "hello").await?;
        let snapshot = provider.snapshot(parent.clone()).await?;
        let forks = provider.fork_many(snapshot, 2).await?;

        provider.write_file(&forks[0], "hello.txt", "bonjour").await?;
        provider.write_file(&forks[1], "hello.txt", "hola").await?;
        // Stand-in for a leak: the parent ends up with a branch's contents.
        provider.write_file(&parent, "hello.txt", "bonjour").await?;

        let report = check_file_isolation(
            &provider,
            "hello.txt",
            &WorldFileExpectation::holds(&parent, "hello"),
            &[
                WorldFileExpectation::holds(&forks[0], "bonjour"),
                WorldFileExpectation::holds(&forks[1], "hola"),
            ],
        )
        .await?;

        assert!(!report.isolated);
        assert!(!report.parent_preserved);
        assert!(report.branches_hold_expected_contents);
        assert_eq!(report.violations.len(), 1);
        assert!(report.violations[0].contains("\"hello\""));
        assert!(report.violations[0].contains("holds \"bonjour\""));

        Ok(())
    }

    #[tokio::test]
    async fn report_flags_worlds_that_did_not_diverge() -> anyhow::Result<()> {
        let root = tempdir()?;
        let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        provider.write_file(&parent, "hello.txt", "hello").await?;
        let snapshot = provider.snapshot(parent.clone()).await?;
        let forks = provider.fork_many(snapshot, 2).await?;

        provider.write_file(&forks[0], "hello.txt", "bonjour").await?;
        provider.write_file(&forks[1], "hello.txt", "bonjour").await?;

        let report = check_file_isolation(
            &provider,
            "hello.txt",
            &WorldFileExpectation::holds(&parent, "hello"),
            &[
                WorldFileExpectation::holds(&forks[0], "bonjour"),
                WorldFileExpectation::holds(&forks[1], "hola"),
            ],
        )
        .await?;

        assert!(!report.isolated);
        assert!(report.parent_preserved);
        assert!(!report.branches_hold_expected_contents);
        assert!(!report.branch_contents_distinct);
        assert_eq!(report.violations.len(), 2);

        Ok(())
    }

    #[tokio::test]
    async fn world_relative_paths_cannot_address_another_world() -> anyhow::Result<()> {
        let root = tempdir()?;
        let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

        let victim = provider.create(AgentId::new(), BranchId::new()).await?;
        provider.write_file(&victim, "hello.txt", "hello").await?;
        let attacker = provider.create(AgentId::new(), BranchId::new()).await?;

        let escape = format!("../{}/hello.txt", victim.0);
        assert!(provider.write_file(&attacker, &escape, "owned").await.is_err());
        assert!(provider.read_file(&attacker, &escape).await.is_err());
        assert!(provider.write_file(&attacker, "", "owned").await.is_err());

        // The neighbouring world is intact, and nothing was written next to it.
        assert_eq!(
            provider.read_file(&victim, "hello.txt").await?.as_deref(),
            Some("hello")
        );
        assert_eq!(provider.read_file(&attacker, "hello.txt").await?, None);

        Ok(())
    }

    #[tokio::test]
    async fn git_worktree_forked_worlds_write_the_same_file_differently() -> anyhow::Result<()> {
        if !git_available().await {
            return Ok(());
        }

        let root = tempdir()?;
        let repo = root.path().join("repo");
        fs::create_dir_all(&repo)?;
        write_file(&repo.join("hello.txt"), "hello")?;

        run_git(&repo, &["init"]).await?;
        run_git(&repo, &["config", "user.email", "genos@example.local"]).await?;
        run_git(&repo, &["config", "user.name", "GenOS Test"]).await?;
        run_git(&repo, &["add", "."]).await?;
        run_git(&repo, &["commit", "-m", "initial"]).await?;

        let provider = GitWorktreeWorldProvider::new(root.path().join("worktrees"), repo)?;
        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        let snapshot = provider.snapshot(parent.clone()).await?;
        let forks = provider.fork_many(snapshot, 2).await?;

        provider.write_file(&forks[0], "hello.txt", "bonjour").await?;
        provider.write_file(&forks[1], "hello.txt", "hola").await?;

        let report = check_file_isolation(
            &provider,
            "hello.txt",
            &WorldFileExpectation::holds(&parent, "hello"),
            &[
                WorldFileExpectation::holds(&forks[0], "bonjour"),
                WorldFileExpectation::holds(&forks[1], "hola"),
            ],
        )
        .await?;

        assert!(report.isolated, "{report:?}");

        Ok(())
    }

    async fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}
