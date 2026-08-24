//! Merge strategies for git-worktree worlds.
//!
//! Two ways to land a world's delta onto a branch of the source repository:
//!
//! - [`merge_via_merge_tree`] is the default: a content-level three-way merge
//!   computed by `git merge-tree --write-tree`, so two worlds that edited
//!   different regions of the same file both land. Conflicting paths come back
//!   in `MergeProposal::conflicts`, untouched on the branch.
//! - [`merge_via_patch_replay`] is the fallback for gits without the
//!   `merge-tree --write-tree` mode: a strict patch replay through a throwaway
//!   index that applies fully or not at all.
//!
//! Both finish with the same atomic commit: a merge commit on top of the
//! target branch, installed by a compare-and-swap `update-ref` so two worlds
//! merging in parallel cannot lose each other's result.

use crate::MergeProposal;
use genos_core::WorldId;
use std::fs;
use std::path::Path;
use tokio::process::Command;

/// Git identity stamped on every commit GenOS creates on behalf of a world.
pub(crate) const GIT_AUTHOR_ENVS: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "GenOS Merge"),
    ("GIT_AUTHOR_EMAIL", "snapshot@genos.local"),
    ("GIT_COMMITTER_NAME", "GenOS Merge"),
    ("GIT_COMMITTER_EMAIL", "snapshot@genos.local"),
];

pub(crate) async fn run_git_env(
    repo: &Path,
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
pub(crate) async fn run_git_env_raw(
    repo: &Path,
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

fn author_envs() -> Vec<(&'static str, String)> {
    GIT_AUTHOR_ENVS
        .iter()
        .map(|(key, value)| (*key, value.to_string()))
        .collect()
}

/// Fast-forward `target_branch` to `commit`, but only if it still points at
/// `expected_parent`: a racing merge moves the branch and this CAS fails
/// instead of overwriting its result.
async fn cas_fast_forward(
    source_repo: &Path,
    target_branch: &str,
    commit: &str,
    expected_parent: &str,
) -> anyhow::Result<()> {
    crate::utils::run_git(
        source_repo,
        &[
            "update-ref",
            &format!("refs/heads/{target_branch}"),
            commit.trim(),
            expected_parent.trim(),
        ],
    )
    .await
    .map(|_| ())
}

/// Content-level three-way merge of the world's delta commit into
/// `target_branch`, without touching any checkout. Returns `Ok(None)` when the
/// installed git cannot run this mode, so the caller can fall back.
pub(crate) async fn merge_via_merge_tree(
    source_repo: &Path,
    world_id: &WorldId,
    target_branch: &str,
    tip: &str,
) -> anyhow::Result<Option<MergeProposal>> {
    let (success, code, stdout, _stderr) = run_git_env_raw(
        source_repo,
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

    // Exit 1 means "merged, but conflicts remain"; anything else that is not
    // success (old git, unknown option, bad object) triggers the fallback.
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

    let parent = crate::utils::run_git(source_repo, &["rev-parse", target_branch]).await?;
    let message = format!("GenOS: merge world {} into {}", world_id.0, target_branch);
    let commit = run_git_env(
        source_repo,
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
        &author_envs()[..],
    )
    .await?;
    cas_fast_forward(source_repo, target_branch, &commit, &parent).await?;

    Ok(Some(MergeProposal {
        target_branch: target_branch.to_string(),
        applied: true,
        files_changed: Vec::new(),
        conflicts: Vec::new(),
    }))
}

/// Strict patch replay of the world's delta onto the target branch's tree
/// through a throwaway index. Applies fully or not at all — no content-level
/// merging.
pub(crate) async fn merge_via_patch_replay(
    source_repo: &Path,
    root_dir: &Path,
    world_path: &Path,
    world_id: &WorldId,
    target_branch: &str,
    tip: &str,
) -> anyhow::Result<MergeProposal> {
    let base = crate::utils::run_git(world_path, &["rev-parse", "HEAD"]).await?;
    let patch = crate::utils::run_git(world_path, &["diff", &base, tip]).await?;
    let patch_file = tempfile::NamedTempFile::new_in(root_dir)?;
    fs::write(patch_file.path(), &patch)?;
    let patch_path = patch_file.path().to_string_lossy().to_string();
    let index_file = tempfile::NamedTempFile::new_in(root_dir)?;
    let index_path = index_file.path().to_string_lossy().to_string();
    let index_env = [("GIT_INDEX_FILE", index_path)];

    // Replay onto the target branch's tree without touching the checkout.
    run_git_env(source_repo, &["read-tree", target_branch], &index_env[..]).await?;

    let check = run_git_env(
        source_repo,
        &["apply", "--cached", "--check", &patch_path],
        &index_env[..],
    )
    .await;

    let applied = match check {
        Ok(_) => {
            run_git_env(
                source_repo,
                &["apply", "--cached", &patch_path],
                &index_env[..],
            )
            .await?;
            let tree = run_git_env(source_repo, &["write-tree"], &index_env[..]).await?;
            let parent = crate::utils::run_git(source_repo, &["rev-parse", target_branch]).await?;
            let message = format!("GenOS: merge world {} into {}", world_id.0, target_branch);
            let commit = run_git_env(
                source_repo,
                &["commit-tree", &tree, "-p", parent.trim(), "-m", &message],
                &author_envs()[..],
            )
            .await?;
            cas_fast_forward(source_repo, target_branch, &commit, &parent).await?;
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
