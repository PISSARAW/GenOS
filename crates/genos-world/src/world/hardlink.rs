//! Copy-on-write fork primitives and the [`HardlinkWorldProvider`].
//!
//! The directory family of providers never copies file bytes when snapshotting
//! or forking:
//!
//! - `snapshot()` hashes every file into a JSON manifest and materializes the
//!   payload as **hardlinks** into `<root>/snapshots/<id>/files` — O(n) reads
//!   and syscalls, zero bytes written.
//! - `fork()` reads that manifest and hardlinks each payload file into the new
//!   world — again zero bytes copied. Any per-file failure (cross-device,
//!   exotic filesystem) falls back to `fs::copy`, so behaviour degrades to the
//!   historical full copy instead of erroring.
//!
//! Because hardlinks alias one inode, an in-place write through one path would
//! leak into every other path. [`break_hardlink_before_write`] is the guard the
//! providers run ahead of every provider-mediated write: when the target still
//! shares its inode it is replaced with a private copy first, restoring true
//! fork isolation at the moment a world starts to diverge.

use crate::utils::collect_files_with_hashes;
use crate::{DestroyOutcome, ExecuteResult, MergeProposal, WorldDiff, WorldProvider};
use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) const MANIFEST_FILE: &str = "manifest.json";
pub(crate) const PAYLOAD_DIR: &str = "files";

/// One file entry of a snapshot manifest: path relative to the world root and
/// the SHA-256 of its contents.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ManifestEntry {
    pub path: String,
    pub hash: String,
}

/// Durable description of a snapshot: which world produced it and what every
/// file hashed to when it was taken.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct SnapshotManifest {
    pub version: u32,
    pub source_world: PathBuf,
    pub files: Vec<ManifestEntry>,
}

/// Number of directory entries sharing `path`'s inode (`1` means private).
pub(crate) fn hard_link_count(metadata: &fs::Metadata) -> u64 {
    #[cfg(unix)]
    {
        std::os::unix::fs::MetadataExt::nlink(metadata)
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        // Stable std cannot query link counts here; assume the inode is
        // shared so any provider-mediated write privatizes first.
        u64::MAX
    }
}

/// Replace `path` with a private copy if it currently shares its inode with a
/// snapshot or sibling world, so a subsequent in-place write stays isolated.
pub(crate) fn break_hardlink_before_write(path: &Path) -> anyhow::Result<()> {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return Ok(());
    };
    if !metadata.is_file() || hard_link_count(&metadata) <= 1 {
        return Ok(());
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("unnameable world path {}", path.display()))?;
    let staging = path.with_file_name(format!(".{name}.genos-cow"));
    fs::copy(path, &staging)?;
    fs::remove_file(path)?;
    fs::rename(&staging, path)?;
    Ok(())
}

fn manifest_path(snapshot_dir: &Path) -> PathBuf {
    snapshot_dir.join(MANIFEST_FILE)
}

fn read_manifest(snapshot_dir: &Path) -> anyhow::Result<SnapshotManifest> {
    let raw = fs::read_to_string(manifest_path(snapshot_dir))?;
    let manifest: SnapshotManifest = serde_json::from_str(&raw)?;
    if manifest.version != 1 {
        anyhow::bail!("unsupported snapshot manifest version {}", manifest.version);
    }
    Ok(manifest)
}

/// Hash every file under `world_path` into a manifest and materialize the
/// snapshot payload as hardlinks (falling back to copies per file). Returns the
/// manifest that was persisted next to the payload.
pub(crate) fn write_snapshot_manifest(
    world_path: &Path,
    snapshot_dir: &Path,
) -> anyhow::Result<SnapshotManifest> {
    let hashes: BTreeMap<PathBuf, String> =
        collect_files_with_hashes(world_path)?.into_iter().collect();
    let payload_root = snapshot_dir.join(PAYLOAD_DIR);
    fs::create_dir_all(&payload_root)?;

    let mut files = Vec::with_capacity(hashes.len());
    for (relative, hash) in &hashes {
        let source = world_path.join(relative);
        let destination = payload_root.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        if fs::hard_link(&source, &destination).is_err() {
            fs::copy(&source, &destination)?;
        }
        files.push(ManifestEntry {
            path: relative.to_string_lossy().replace('\\', "/"),
            hash: hash.clone(),
        });
    }

    let manifest = SnapshotManifest {
        version: 1,
        source_world: world_path.to_path_buf(),
        files,
    };
    fs::write(
        manifest_path(snapshot_dir),
        serde_json::to_string_pretty(&manifest)?,
    )?;
    Ok(manifest)
}

/// Populate `destination` from a snapshot by hardlinking each manifest entry
/// out of the payload dir, with two fallbacks per entry: copy from the payload,
/// then hardlink/copy straight from the originating world. Returns how many
/// entries were linked without copying bytes.
pub(crate) fn materialize_via_hardlinks(
    snapshot_dir: &Path,
    destination: &Path,
) -> anyhow::Result<(SnapshotManifest, usize)> {
    let manifest = read_manifest(snapshot_dir)?;
    let payload_root = snapshot_dir.join(PAYLOAD_DIR);
    fs::create_dir_all(destination)?;
    let mut linked = 0usize;

    for entry in &manifest.files {
        let relative = Path::new(&entry.path);
        let target = destination.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let payload_file = payload_root.join(relative);
        let origin_file = manifest.source_world.join(relative);
        let source = if payload_file.is_file() {
            &payload_file
        } else if origin_file.is_file() {
            &origin_file
        } else {
            anyhow::bail!(
                "snapshot payload is missing '{}' and its source world no longer holds it",
                entry.path
            );
        };
        if fs::hard_link(source, &target).is_ok() {
            linked += 1;
        } else {
            fs::copy(source, &target)?;
        }
    }

    Ok((manifest, linked))
}

/// A [`DirectoryWorldProvider`](super::DirectoryWorldProvider) whose forks are
/// hardlinks instead of copies — same layout, same guarantees, explicit CoW
/// telemetry identity. It exists so call sites can *name* the backend they rely
/// on; `DirectoryWorldProvider` itself delegates to these same primitives.
#[derive(Clone, Debug)]
pub struct HardlinkWorldProvider {
    inner: super::DirectoryWorldProvider,
}

impl HardlinkWorldProvider {
    pub fn new(root_dir: PathBuf, seed_dir: Option<PathBuf>) -> anyhow::Result<Self> {
        Ok(Self {
            inner: super::DirectoryWorldProvider::new(root_dir, seed_dir)?,
        })
    }
}

#[async_trait]
impl WorldProvider for HardlinkWorldProvider {
    fn provider_kind(&self) -> &str {
        "hardlink"
    }

    async fn create(&self, agent_id: AgentId, branch_id: BranchId) -> anyhow::Result<WorldId> {
        self.inner.create(agent_id, branch_id).await
    }

    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId> {
        self.inner.snapshot(world_id).await
    }

    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId> {
        self.inner.fork(snapshot_id).await
    }

    async fn fork_many(&self, snapshot_id: SnapshotId, count: u32) -> anyhow::Result<Vec<WorldId>> {
        self.inner.fork_many(snapshot_id, count).await
    }

    fn world_path(&self, world_id: &WorldId) -> anyhow::Result<PathBuf> {
        self.inner.world_path(world_id)
    }

    async fn write_file(
        &self,
        world_id: &WorldId,
        relative_path: &str,
        contents: &str,
    ) -> anyhow::Result<()> {
        self.inner
            .write_file(world_id, relative_path, contents)
            .await
    }

    async fn merge_into(
        &self,
        world_id: WorldId,
        target_branch: &str,
    ) -> anyhow::Result<MergeProposal> {
        self.inner.merge_into(world_id, target_branch).await
    }

    async fn diff(&self, a: WorldId, b: WorldId) -> anyhow::Result<WorldDiff> {
        self.inner.diff(a, b).await
    }

    async fn execute(&self, world_id: WorldId, command: &str) -> anyhow::Result<ExecuteResult> {
        self.inner.execute(world_id, command).await
    }

    async fn inspect(&self, world_id: WorldId) -> anyhow::Result<String> {
        self.inner.inspect(world_id).await
    }

    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<DestroyOutcome> {
        self.inner.destroy(world_id).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn provider_kind_is_reported_for_telemetry() {
        let root = tempdir().unwrap();
        let provider = HardlinkWorldProvider::new(root.path().join("state"), None).unwrap();
        assert_eq!(provider.provider_kind(), "hardlink");
    }

    #[test]
    fn break_hardlink_leaves_private_files_alone() -> anyhow::Result<()> {
        let root = tempdir()?;
        let file = root.path().join("solo.txt");
        fs::write(&file, "solo")?;
        break_hardlink_before_write(&file)?;
        assert_eq!(fs::read_to_string(&file)?, "solo");
        Ok(())
    }

    #[test]
    fn break_hardlink_privatises_shared_inode() -> anyhow::Result<()> {
        let root = tempdir()?;
        let original = root.path().join("shared.txt");
        fs::write(&original, "shared")?;
        let alias = root.path().join("alias.txt");
        fs::hard_link(&original, &alias)?;

        break_hardlink_before_write(&original)?;
        fs::write(&original, "diverged")?;

        assert_eq!(fs::read_to_string(&alias)?, "shared");
        Ok(())
    }

    #[tokio::test]
    async fn fork_many_materializes_from_manifest_without_copying_seed_writes() -> anyhow::Result<()>
    {
        let root = tempdir()?;
        let seed = root.path().join("seed");
        fs::create_dir_all(seed.join("nested"))?;
        fs::write(seed.join("nested/deep.txt"), "deep")?;

        let provider = HardlinkWorldProvider::new(root.path().join("state"), Some(seed))?;
        let parent = provider.create(AgentId::new(), BranchId::new()).await?;
        let snapshot = provider.snapshot(parent.clone()).await?;
        let worlds = provider.fork_many(snapshot.clone(), 3).await?;

        // Every fork starts on the snapshotted contents…
        for world in &worlds {
            assert_eq!(
                provider
                    .read_file(world, "nested/deep.txt")
                    .await?
                    .as_deref(),
                Some("deep")
            );
        }
        // …and a provider-mediated write diverges without leaking anywhere.
        provider
            .write_file(&worlds[0], "nested/deep.txt", "mine")
            .await?;
        assert_eq!(
            provider
                .read_file(&worlds[0], "nested/deep.txt")
                .await?
                .as_deref(),
            Some("mine")
        );
        assert_eq!(
            provider
                .read_file(&worlds[1], "nested/deep.txt")
                .await?
                .as_deref(),
            Some("deep")
        );
        assert_eq!(
            provider
                .read_file(&parent, "nested/deep.txt")
                .await?
                .as_deref(),
            Some("deep")
        );

        let snapshot_dir = root.path().join("state/snapshots").join(&snapshot.0);
        assert!(snapshot_dir.join(MANIFEST_FILE).is_file());
        assert!(snapshot_dir
            .join(PAYLOAD_DIR)
            .join("nested/deep.txt")
            .is_file());

        // The snapshot payload still holds the pre-fork contents.
        let payload = fs::read_to_string(snapshot_dir.join(PAYLOAD_DIR).join("nested/deep.txt"))?;
        assert_eq!(payload, "deep");
        Ok(())
    }
}
