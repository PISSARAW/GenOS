//! A [`WorldProvider`] backed by git worktrees.
//!
//! Each world is its own worktree, branched off a shared source repository.
//! A snapshot is the commit the worktree's HEAD points at, and forking means
//! checking out that commit as a detached worktree.

use crate::utils::{collect_files_with_hashes, count_files, execute_command_in_dir, run_git};
use crate::{DestroyOutcome, ExecuteResult, WorldDiff, WorldError, WorldProvider};
use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

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
            &[
                "worktree",
                "add",
                "--detach",
                &world_path_s,
                commit.as_str(),
            ],
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
