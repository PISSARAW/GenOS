//! A [`WorldProvider`] backed by plain directories on disk.
//!
//! Each world is a directory under `<root>/worlds/<id>`; each snapshot is a
//! directory under `<root>/snapshots/<id>`. Forking copies a snapshot to a
//! fresh world, so sibling forks and their parent diverge on disk.

use crate::utils::{
    collect_files_with_hashes, copy_directory_recursive, count_files, execute_command_in_dir,
};
use crate::{DestroyOutcome, ExecuteResult, WorldDiff, WorldError, WorldProvider};
use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

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
