//! World providers — the on-disk substrate that backs every fork.
//!
//! A [`WorldProvider`] is what `genos_core` asks for when it needs to spin up
//! a new isolated execution environment, snapshot it, fork from that snapshot,
//! diff two worlds, run a command inside one, or tear it down. The trait is
//! deliberately small so different backends (plain directories, git worktrees,
//! …) can plug in without leaking their internals.
//!
//! The two implementations live in `directory` and `git_worktree`; the
//! helpers they share live in `utils`.

mod directory;
mod git_worktree;

pub use directory::DirectoryWorldProvider;
pub use git_worktree::GitWorktreeWorldProvider;

// File-level fork isolation lives in `crate::files` because the test surface
// for it is shared with `crate::world::tests` and `crate::world::tests::*`.
// (Re-exporting here keeps call sites that import `genos_world::*` from
// having to know the internal layout.)
pub use crate::files::{
    check_file_isolation, FileIsolationCheck, FileIsolationReport, WorldFileExpectation,
    WorldFileObservation,
};

use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

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

// `resolve_world_relative_path` lives in `crate::utils`; we re-export it here
// so callers reach it as `genos_world::resolve_world_relative_path` and the
// trait's default methods above can call it directly.
pub use crate::utils::{resolve_world_relative_path, run_git};
