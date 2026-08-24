//! Auto-selecting world provider.
//!
//! [`AutoWorldProvider`] inspects the source directory at construction time
//! and delegates every operation to the correct backend:
//!
//! - **git repo** (`.git` present) → [`GitWorktreeWorldProvider`]: fork is O(1),
//!   each world is an isolated worktree sharing the object store.
//! - **plain directory** → [`DirectoryWorldProvider`]: full copy fallback.
//!
//! Call sites need zero changes: replace `DirectoryWorldProvider::new` with
//! `AutoWorldProvider::new` and the right backend is chosen automatically.

use crate::world::{DirectoryWorldProvider, GitWorktreeWorldProvider};
use crate::{DestroyOutcome, ExecuteResult, WorldDiff, WorldProvider};
use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

/// Wraps either a git-worktree or a directory-copy world provider.
/// The active variant is chosen once at construction and never changes.
pub enum AutoWorldProvider {
    Git(GitWorktreeWorldProvider),
    Directory(DirectoryWorldProvider),
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

impl AutoWorldProvider {
    /// Select a backend based on whether `source` contains a `.git` directory.
    ///
    /// `root_dir` is where worlds and snapshots will be stored.
    /// `source` is the seed repository / directory to fork from.
    pub fn new(root_dir: PathBuf, source: PathBuf) -> anyhow::Result<Self> {
        if is_git_repo(&source) {
            let provider = GitWorktreeWorldProvider::new(root_dir, source)?;
            Ok(Self::Git(provider))
        } else {
            let provider = DirectoryWorldProvider::new(root_dir, Some(source))?;
            Ok(Self::Directory(provider))
        }
    }

    /// Returns `"git"` or `"directory"` — useful for telemetry.
    pub fn backend_kind(&self) -> &'static str {
        match self {
            Self::Git(_) => "git",
            Self::Directory(_) => "directory",
        }
    }
}

fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

// ---------------------------------------------------------------------------
// WorldProvider delegation
// ---------------------------------------------------------------------------

#[async_trait]
impl WorldProvider for AutoWorldProvider {
    fn provider_kind(&self) -> &str {
        match self {
            Self::Git(p) => p.provider_kind(),
            Self::Directory(p) => p.provider_kind(),
        }
    }

    async fn create(&self, agent_id: AgentId, branch_id: BranchId) -> anyhow::Result<WorldId> {
        match self {
            Self::Git(p) => p.create(agent_id, branch_id).await,
            Self::Directory(p) => p.create(agent_id, branch_id).await,
        }
    }

    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId> {
        match self {
            Self::Git(p) => p.snapshot(world_id).await,
            Self::Directory(p) => p.snapshot(world_id).await,
        }
    }

    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId> {
        match self {
            Self::Git(p) => p.fork(snapshot_id).await,
            Self::Directory(p) => p.fork(snapshot_id).await,
        }
    }

    fn world_path(&self, world_id: &WorldId) -> anyhow::Result<PathBuf> {
        match self {
            Self::Git(p) => p.world_path(world_id),
            Self::Directory(p) => p.world_path(world_id),
        }
    }

    async fn diff(&self, a: WorldId, b: WorldId) -> anyhow::Result<WorldDiff> {
        match self {
            Self::Git(p) => p.diff(a, b).await,
            Self::Directory(p) => p.diff(a, b).await,
        }
    }

    async fn merge_into(
        &self,
        world_id: WorldId,
        target_branch: &str,
    ) -> anyhow::Result<crate::MergeProposal> {
        match self {
            Self::Git(p) => p.merge_into(world_id, target_branch).await,
            Self::Directory(p) => p.merge_into(world_id, target_branch).await,
        }
    }

    async fn execute(&self, world_id: WorldId, command: &str) -> anyhow::Result<ExecuteResult> {
        match self {
            Self::Git(p) => p.execute(world_id, command).await,
            Self::Directory(p) => p.execute(world_id, command).await,
        }
    }

    async fn inspect(&self, world_id: WorldId) -> anyhow::Result<String> {
        match self {
            Self::Git(p) => p.inspect(world_id).await,
            Self::Directory(p) => p.inspect(world_id).await,
        }
    }

    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<DestroyOutcome> {
        match self {
            Self::Git(p) => p.destroy(world_id).await,
            Self::Directory(p) => p.destroy(world_id).await,
        }
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
    fn selects_directory_for_plain_dir() {
        let root = tempdir().unwrap();
        let source = tempdir().unwrap();
        let provider =
            AutoWorldProvider::new(root.path().to_path_buf(), source.path().to_path_buf()).unwrap();
        assert_eq!(provider.backend_kind(), "directory");
    }

    #[test]
    fn detects_git_repo() {
        let source = tempdir().unwrap();
        std::fs::create_dir(source.path().join(".git")).unwrap();
        assert!(is_git_repo(source.path()));
    }

    #[test]
    fn non_git_dir_not_detected() {
        let source = tempdir().unwrap();
        assert!(!is_git_repo(source.path()));
    }

    #[tokio::test]
    async fn backend_kind_in_telemetry() {
        let root = tempdir().unwrap();
        let source = tempdir().unwrap();
        let provider =
            AutoWorldProvider::new(root.path().to_path_buf(), source.path().to_path_buf()).unwrap();
        // backend_kind must be a static string, not empty
        assert!(!provider.backend_kind().is_empty());
    }
}
