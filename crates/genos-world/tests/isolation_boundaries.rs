//! Boundary audit for the directory-backed world provider.
//!
//! These tests intentionally separate the guarantee that is implemented
//! (working-directory/file isolation) from guarantees that are not implemented
//! (OS process, environment, and network sandboxing).

#![cfg(unix)]

use genos_core::{AgentId, BranchId};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use std::fs;
use tempfile::tempdir;

#[tokio::test]
async fn child_process_relative_writes_stay_in_the_forked_world() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    let fork = provider.fork(snapshot).await?;

    let result = provider
        .execute(fork.clone(), "printf child > process-output.txt")
        .await?;

    assert_eq!(result.exit_code, 0);
    assert_eq!(
        provider
            .read_file(&fork, "process-output.txt")
            .await?
            .as_deref(),
        Some("child")
    );
    assert_eq!(
        provider.read_file(&parent, "process-output.txt").await?,
        None
    );
    Ok(())
}

#[tokio::test]
async fn environment_is_inherited_by_child_processes_and_is_not_sandboxed() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;
    let world = provider.create(AgentId::new(), BranchId::new()).await?;
    let sentinel = format!("genos-boundary-{}", std::process::id());
    std::env::set_var("GENOS_ISOLATION_SENTINEL", &sentinel);

    let result = provider
        .execute(
            world.clone(),
            "printf '%s' \"$GENOS_ISOLATION_SENTINEL\" > inherited-env.txt",
        )
        .await?;

    std::env::remove_var("GENOS_ISOLATION_SENTINEL");
    assert_eq!(result.exit_code, 0);
    assert_eq!(
        provider
            .read_file(&world, "inherited-env.txt")
            .await?
            .as_deref(),
        Some(sentinel.as_str())
    );
    Ok(())
}

#[test]
fn provider_layout_is_directory_scoped_not_an_os_sandbox() -> anyhow::Result<()> {
    let root = tempdir()?;
    let _provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;
    let state = root.path().join("state");

    assert!(state.join("worlds").is_dir());
    assert!(state.join("snapshots").is_dir());
    assert!(
        fs::metadata(&state).is_ok(),
        "the current provider is a filesystem layout, not a process/network sandbox"
    );
    Ok(())
}
