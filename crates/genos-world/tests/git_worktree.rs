//! Git-worktree-backed world provider tests. Skipped if `git` is unavailable.

use genos_core::{AgentId, BranchId};
use genos_world::{
    check_file_isolation, run_git, GitWorktreeWorldProvider, WorldFileExpectation, WorldProvider,
};
use std::fs;
use std::path::Path;
use tempfile::tempdir;
use tokio::process::Command;

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

async fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

async fn init_test_repo(repo: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(repo)?;
    write_file(&repo.join("service.txt"), "base")?;

    run_git(repo, &["init"]).await?;
    run_git(repo, &["config", "user.email", "genos@example.local"]).await?;
    run_git(repo, &["config", "user.name", "GenOS Test"]).await?;
    run_git(repo, &["add", "."]).await?;
    run_git(repo, &["commit", "-m", "initial"]).await?;
    Ok(())
}

#[tokio::test]
async fn git_worktree_provider_keeps_worlds_isolated() -> anyhow::Result<()> {
    if !git_available().await {
        return Ok(());
    }

    let root = tempdir()?;
    let repo = root.path().join("repo");
    init_test_repo(&repo).await?;

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

    provider
        .write_file(&forks[0], "hello.txt", "bonjour")
        .await?;
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
