//! A [`WorldProvider`] backed by plain directories on disk.
//!
//! Each world is a directory under `<root>/worlds/<id>`; each snapshot is a
//! directory under `<root>/snapshots/<id>`. Snapshotting hashes every file
//! into a JSON manifest and hardlinks the payload instead of copying it, and
//! forking hardlinks each snapshot entry into the fresh world (falling back to
//! a copy per file when the filesystem refuses), so a 500-file workspace costs
//! zero copied bytes per fork. Writes through the provider break any shared
//! link first — see [`crate::world::hardlink`].

use crate::utils::{collect_files_with_hashes, count_files, execute_command_in_dir};
use crate::world::hardlink::{
    break_hardlink_before_write, materialize_via_hardlinks, write_snapshot_manifest, ManifestEntry,
};
use crate::{DestroyOutcome, ExecuteResult, MergeProposal, WorldDiff, WorldError, WorldProvider};
use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use std::collections::{BTreeMap, HashSet};
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

    /// Sidecar recording which snapshot contents a forked world started from,
    /// so `merge_into` can name exactly what diverged. Stored next to the
    /// world directory rather than inside it, to keep world contents clean.
    fn origin_file(&self, world_id: &WorldId) -> PathBuf {
        self.root_dir
            .join("worlds")
            .join(format!("{}.origin.json", world_id.0))
    }

    async fn record_origin(
        &self,
        world_id: &WorldId,
        files: Vec<ManifestEntry>,
    ) -> anyhow::Result<()> {
        #[derive(serde::Serialize)]
        struct Origin<'a> {
            version: u32,
            files: &'a [ManifestEntry],
        }
        let json = serde_json::to_string(&Origin {
            version: 1,
            files: &files,
        })?;
        fs::write(self.origin_file(world_id), json)?;
        Ok(())
    }

    fn read_origin(&self, world_id: &WorldId) -> anyhow::Result<Vec<ManifestEntry>> {
        #[derive(serde::Deserialize)]
        struct Origin {
            files: Vec<ManifestEntry>,
        }
        let path = self.origin_file(world_id);
        if !path.exists() {
            anyhow::bail!("world {} has no fork origin recorded", world_id.0);
        }
        Ok(serde_json::from_str::<Origin>(&fs::read_to_string(path)?)?.files)
    }
}

#[async_trait]
impl WorldProvider for DirectoryWorldProvider {
    fn provider_kind(&self) -> &str {
        "directory"
    }

    async fn create(&self, _agent_id: AgentId, _branch_id: BranchId) -> anyhow::Result<WorldId> {
        let world_id = WorldId::new();
        let world_path = self.root_dir.join("worlds").join(&world_id.0);
        fs::create_dir_all(&world_path)?;

        if let Some(seed) = &self.seed_dir {
            // The seed is the user's live project: real copies, never links.
            crate::utils::copy_directory_recursive(seed, &world_path)?;
        }

        Ok(world_id)
    }

    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId> {
        let world_path = self.world_path(&world_id)?;
        let snapshot_id = SnapshotId::new();
        let snapshot_path = self.root_dir.join("snapshots").join(&snapshot_id.0);
        fs::create_dir_all(&snapshot_path)?;
        write_snapshot_manifest(&world_path, &snapshot_path)?;
        Ok(snapshot_id)
    }

    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId> {
        let snapshot_path = self.snapshot_path(&snapshot_id)?;

        let world_id = WorldId::new();
        let world_path = self.root_dir.join("worlds").join(&world_id.0);
        let (manifest, _) = materialize_via_hardlinks(&snapshot_path, &world_path)?;

        // Remember what this world started from so merge_into can diff it.
        self.record_origin(&world_id, manifest.files).await?;

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

    async fn write_file(
        &self,
        world_id: &WorldId,
        relative_path: &str,
        contents: &str,
    ) -> anyhow::Result<()> {
        let path = crate::resolve_world_relative_path(&self.world_path(world_id)?, relative_path)?;
        break_hardlink_before_write(&path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, contents)?;
        Ok(())
    }

    /// Propose this world's divergence from its fork origin as a merge into
    /// `target_branch`. The directory backend never touches git: it reports
    /// the changed files and leaves `applied` false.
    async fn merge_into(
        &self,
        world_id: WorldId,
        target_branch: &str,
    ) -> anyhow::Result<MergeProposal> {
        let origin: BTreeMap<String, String> = self
            .read_origin(&world_id)?
            .into_iter()
            .map(|entry| (entry.path, entry.hash))
            .collect();

        let world_path = self.world_path(&world_id)?;
        let current = collect_files_with_hashes(&world_path)?;

        let mut all_paths: HashSet<String> = origin.keys().cloned().collect();
        all_paths.extend(
            current
                .keys()
                .map(|p| p.to_string_lossy().replace('\\', "/")),
        );

        let mut files_changed: Vec<String> = all_paths
            .into_iter()
            .filter(|path| {
                let relative = std::path::Path::new(path);
                match current.get(relative) {
                    Some(hash) => origin.get(path).map(|o| o != hash).unwrap_or(true),
                    None => true,
                }
            })
            .collect();
        files_changed.sort();

        Ok(MergeProposal {
            target_branch: target_branch.to_string(),
            applied: false,
            files_changed,
            conflicts: Vec::new(),
        })
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
            "provider={} world_id={} path={} files={}",
            self.provider_kind(),
            world_id,
            path.display(),
            file_count
        ))
    }

    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<DestroyOutcome> {
        let path = self.root_dir.join("worlds").join(&world_id.0);
        if path.exists() {
            fs::remove_dir_all(path)?;
            fs::remove_file(self.origin_file(&world_id)).ok();
            Ok(DestroyOutcome::Destroyed)
        } else {
            Ok(DestroyOutcome::AlreadyAbsent)
        }
    }
}
