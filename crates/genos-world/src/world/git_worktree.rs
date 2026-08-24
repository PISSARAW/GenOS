//! A [`WorldProvider`] backed by git worktrees.
//!
//! Each world is its own worktree, branched off a shared source repository.
//! A snapshot is the commit the worktree's HEAD points at, and forking means
//! checking out that commit as a detached worktree.

use crate::utils::{collect_files_with_hashes, count_files, execute_command_in_dir, run_git};
use crate::{DestroyOutcome, ExecuteResult, MergeProposal, WorldDiff, WorldError, WorldProvider};
use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tokio::process::Command;

/// Git identity stamped on every commit GenOS creates on behalf of a world.
const GIT_AUTHOR_ENVS: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "GenOS Merge"),
    ("GIT_AUTHOR_EMAIL", "snapshot@genos.local"),
    ("GIT_COMMITTER_NAME", "GenOS Merge"),
    ("GIT_COMMITTER_EMAIL", "snapshot@genos.local"),
];

async fn run_git_env(
    repo: &std::path::Path,
    args: &[&str],
    extra_env: &[(&str, String)],
) -> anyhow::Result<String> {
    let (success, _, stdout, stderr) = run_git_env_raw(repo, args, extra_env).await?;
    if success {
        Ok(stdout)
    } else {
        Err(anyhow::anyhow!(
            "git command failed: git -C {} {}\nstderr: {}",
            repo.display(),
            args.join(" "),
            stderr
        ))
    }
}

/// Run git with extra environment, reporting the outcome instead of erroring
/// on non-zero status so callers can tell conflicts apart from hard failures.
async fn run_git_env_raw(
    repo: &std::path::Path,
    args: &[&str],
    extra_env: &[(&str, String)],
) -> anyhow::Result<(bool, Option<i32>, String, String)> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo);
    for (key, value) in extra_env {
        cmd.env(key, value);
    }
    cmd.args(args);
    let output = cmd.output().await?;
    Ok((
        output.status.success(),
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
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

    /// Content-level three-way merge of the world's delta commit into
    /// `target_branch`, without touching any checkout. Returns `Ok(None)` when
    /// the installed git cannot run this mode, so the caller can fall back.
    async fn merge_via_merge_tree(
        &self,
        world_id: WorldId,
        target_branch: &str,
        tip: &str,
    ) -> anyhow::Result<Option<MergeProposal>> {
        let (success, code, stdout, _stderr) = run_git_env_raw(
            &self.source_repo,
            &[
                "merge-tree",
                "--write-tree",
                "--name-only",
                target_branch,
                tip,
            ],
            &[],
        )
        .await?;

        // Exit 1 means "merged, but conflicts remain"; anything else that is
        // not success (old git, unknown option, bad object) triggers fallback.
        if !success && code != Some(1) {
            return Ok(None);
        }

        let mut lines = stdout.lines();
        let tree = lines.next().unwrap_or_default().trim().to_string();
        let conflicts: Vec<String> = lines
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(ToString::to_string)
            .collect();

        if !success {
            return Ok(Some(MergeProposal {
                target_branch: target_branch.to_string(),
                applied: false,
                files_changed: Vec::new(),
                conflicts,
            }));
        }

        let parent = run_git(&self.source_repo, &["rev-parse", target_branch]).await?;
        let message = format!("GenOS: merge world {} into {}", world_id.0, target_branch);
        let commit = run_git_env(
            &self.source_repo,
            &[
                "commit-tree",
                &tree,
                "-p",
                parent.trim(),
                "-p",
                tip,
                "-m",
                &message,
            ],
            &GIT_AUTHOR_ENVS
                .iter()
                .map(|(k, v)| (*k, v.to_string()))
                .collect::<Vec<_>>()[..],
        )
        .await?;
        // CAS fast-forward: only move the branch from the parent we merged on.
        run_git(
            &self.source_repo,
            &[
                "update-ref",
                &format!("refs/heads/{target_branch}"),
                commit.trim(),
                parent.trim(),
            ],
        )
        .await?;

        Ok(Some(MergeProposal {
            target_branch: target_branch.to_string(),
            applied: true,
            files_changed: Vec::new(),
            conflicts: Vec::new(),
        }))
    }

    /// Legacy path for gits without `merge-tree --write-tree`: replay the
    /// world's patch onto the target branch's tree through a throwaway index.
    /// Applies fully or not at all — no content-level merging.
    async fn merge_via_patch_replay(
        &self,
        world_id: WorldId,
        target_branch: &str,
        tip: &str,
    ) -> anyhow::Result<MergeProposal> {
        let world_path = self.world_path(&world_id)?;
        let base = run_git(&world_path, &["rev-parse", "HEAD"]).await?;
        let patch = run_git(&world_path, &["diff", &base, tip]).await?;
        let patch_file = tempfile::NamedTempFile::new_in(&self.root_dir)?;
        fs::write(patch_file.path(), &patch)?;
        let patch_path = patch_file.path().to_string_lossy().to_string();
        let index_file = tempfile::NamedTempFile::new_in(&self.root_dir)?;
        let index_path = index_file.path().to_string_lossy().to_string();
        let index_env = [("GIT_INDEX_FILE", index_path)];

        // Replay onto the target branch's tree without touching the checkout.
        run_git_env(
            &self.source_repo,
            &["read-tree", target_branch],
            &index_env[..],
        )
        .await?;

        let check = run_git_env(
            &self.source_repo,
            &["apply", "--cached", "--check", &patch_path],
            &index_env[..],
        )
        .await;

        let applied = match check {
            Ok(_) => {
                run_git_env(
                    &self.source_repo,
                    &["apply", "--cached", &patch_path],
                    &index_env[..],
                )
                .await?;
                let tree = run_git_env(&self.source_repo, &["write-tree"], &index_env[..]).await?;
                let parent = run_git(&self.source_repo, &["rev-parse", target_branch]).await?;
                let message = format!("GenOS: merge world {} into {}", world_id.0, target_branch);
                let commit = run_git_env(
                    &self.source_repo,
                    &["commit-tree", &tree, "-p", parent.trim(), "-m", &message],
                    &GIT_AUTHOR_ENVS
                        .iter()
                        .map(|(k, v)| (*k, v.to_string()))
                        .collect::<Vec<_>>()[..],
                )
                .await?;
                // CAS fast-forward: only move the branch from `parent`.
                run_git(
                    &self.source_repo,
                    &[
                        "update-ref",
                        &format!("refs/heads/{target_branch}"),
                        commit.trim(),
                        parent.trim(),
                    ],
                )
                .await?;
                true
            }
            Err(_) => false,
        };

        Ok(MergeProposal {
            target_branch: target_branch.to_string(),
            applied,
            files_changed: Vec::new(),
            conflicts: Vec::new(),
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

    async fn run_git_indexed(
        &self,
        world_path: &std::path::Path,
        index: &std::path::Path,
        args: &[&str],
    ) -> anyhow::Result<String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(world_path)
            .args(args)
            .env("GIT_INDEX_FILE", index)
            .env("GIT_AUTHOR_NAME", "GenOS Snapshot")
            .env("GIT_AUTHOR_EMAIL", "snapshot@genos.local")
            .env("GIT_COMMITTER_NAME", "GenOS Snapshot")
            .env("GIT_COMMITTER_EMAIL", "snapshot@genos.local")
            .output()
            .await?;
        if !output.status.success() {
            anyhow::bail!(
                "git {} failed: {}",
                args.join(" "),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Ok(String::from_utf8(output.stdout)?.trim().to_string())
    }
}

#[async_trait]
impl WorldProvider for GitWorktreeWorldProvider {
    fn provider_kind(&self) -> &str {
        "git_worktree"
    }

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
        let snapshot_id = SnapshotId::new();
        let index_path = self
            .root_dir
            .join("snapshots")
            .join(format!("{}.index", snapshot_id.0));
        let real_index = run_git(&world_path, &["rev-parse", "--git-path", "index"]).await?;
        let real_index = PathBuf::from(real_index.trim());
        let real_index = if real_index.is_absolute() {
            real_index
        } else {
            world_path.join(real_index)
        };
        fs::copy(real_index, &index_path)?;
        let result = async {
            self.run_git_indexed(&world_path, &index_path, &["add", "-A"])
                .await?;
            let tree = self
                .run_git_indexed(&world_path, &index_path, &["write-tree"])
                .await?;
            let head = run_git(&world_path, &["rev-parse", "HEAD"]).await?;
            self.run_git_indexed(
                &world_path,
                &index_path,
                &[
                    "commit-tree",
                    &tree,
                    "-p",
                    head.trim(),
                    "-m",
                    "GenOS workspace snapshot",
                ],
            )
            .await
        }
        .await;
        fs::remove_file(&index_path).ok();
        let commit = result?;
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

    /// Extract this world's delta (working tree vs the commit it sits on) and
    /// merge it into `target_branch` of the source repository.
    ///
    /// The merge is a true content-level three-way: `git merge-tree --write-tree`
    /// combines the world's delta commit with the target branch using their
    /// merge base, so two worlds that edited different regions of the same file
    /// both land. Conflicting paths are reported in `conflicts` and left
    /// untouched on the branch. Repos whose git predates `merge-tree --write-tree`
    /// fall back to a strict patch replay, which applies or reports conflicts.
    async fn merge_into(
        &self,
        world_id: WorldId,
        target_branch: &str,
    ) -> anyhow::Result<MergeProposal> {
        let world_path = self.world_path(&world_id)?;

        // Commit the world's current state so its delta becomes git objects.
        let snapshot = self.snapshot(world_id.clone()).await?;
        let tip = self.read_snapshot_commit(&snapshot)?;
        let base = run_git(&world_path, &["rev-parse", "HEAD"]).await?;

        let name_status = run_git(&world_path, &["diff", "--name-status", &base, &tip]).await?;
        let mut files_changed: Vec<String> = name_status
            .lines()
            .filter_map(|line| line.split('\t').last())
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(ToString::to_string)
            .collect();
        files_changed.sort();

        if files_changed.is_empty() {
            return Ok(MergeProposal {
                target_branch: target_branch.to_string(),
                applied: false,
                files_changed,
                conflicts: Vec::new(),
            });
        }

        let proposal = match self
            .merge_via_merge_tree(world_id.clone(), target_branch, &tip)
            .await?
        {
            Some(result) => result,
            None => {
                self.merge_via_patch_replay(world_id.clone(), target_branch, &tip)
                    .await?
            }
        };

        Ok(MergeProposal {
            files_changed,
            ..proposal
        })
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
            "provider={} world_id={} path={} commit={} files={}",
            self.provider_kind(),
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
