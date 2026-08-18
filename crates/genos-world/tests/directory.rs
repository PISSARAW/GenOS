//! Directory-backed world provider tests.

use genos_core::{AgentId, BranchId};
use genos_world::{DestroyOutcome, DirectoryWorldProvider, WorldProvider};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

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

#[tokio::test]
async fn directory_provider_keeps_worlds_isolated() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    write_file(&seed.join("src/app.txt"), "base")?;

    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let world_a = provider.create(AgentId::new(), BranchId::new()).await?;
    let world_b = provider.create(AgentId::new(), BranchId::new()).await?;

    let a_path = provider.world_path(&world_a)?;
    let b_path = provider.world_path(&world_b)?;

    write_file(&a_path.join("src/app.txt"), "strategy-a")?;
    write_file(&b_path.join("src/app.txt"), "strategy-b")?;

    let a = read_file(&a_path.join("src/app.txt"))?;
    let b = read_file(&b_path.join("src/app.txt"))?;

    assert_eq!(a, "strategy-a");
    assert_eq!(b, "strategy-b");
    assert_ne!(a, b);

    Ok(())
}

#[tokio::test]
async fn directory_provider_fork_keeps_isolation() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    write_file(&seed.join("README.md"), "initial")?;

    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent).await?;
    let children = provider.fork_many(snapshot, 2).await?;

    let child_a_path = provider.world_path(&children[0])?;
    let child_b_path = provider.world_path(&children[1])?;

    write_file(&child_a_path.join("README.md"), "child-a-change")?;
    write_file(&child_b_path.join("README.md"), "child-b-change")?;

    let child_a = read_file(&child_a_path.join("README.md"))?;
    let child_b = read_file(&child_b_path.join("README.md"))?;

    assert_eq!(child_a, "child-a-change");
    assert_eq!(child_b, "child-b-change");
    assert_ne!(child_a, child_b);

    Ok(())
}

#[tokio::test]
async fn directory_provider_execute_keeps_branches_isolated() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    write_file(&seed.join("README.md"), "initial")?;

    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent).await?;
    let children = provider.fork_many(snapshot, 2).await?;

    let cmd_a = if cfg!(windows) {
        "echo branch-a> marker.txt"
    } else {
        "printf 'branch-a' > marker.txt"
    };
    let cmd_b = if cfg!(windows) {
        "echo branch-b> marker.txt"
    } else {
        "printf 'branch-b' > marker.txt"
    };

    let out_a = provider.execute(children[0].clone(), cmd_a).await?;
    let out_b = provider.execute(children[1].clone(), cmd_b).await?;
    assert_eq!(out_a.exit_code, 0);
    assert_eq!(out_b.exit_code, 0);

    let a_path = provider.world_path(&children[0])?;
    let b_path = provider.world_path(&children[1])?;
    let a_marker = read_file(&a_path.join("marker.txt"))?.trim().to_string();
    let b_marker = read_file(&b_path.join("marker.txt"))?.trim().to_string();

    assert_eq!(a_marker, "branch-a");
    assert_eq!(b_marker, "branch-b");
    assert_ne!(a_marker, b_marker);

    Ok(())
}

#[tokio::test]
async fn directory_provider_destroy_is_idempotent() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;
    let world = provider.create(AgentId::new(), BranchId::new()).await?;

    let first = provider.destroy(world.clone()).await?;
    let second = provider.destroy(world).await?;

    assert_eq!(first, DestroyOutcome::Destroyed);
    assert_eq!(second, DestroyOutcome::AlreadyAbsent);
    Ok(())
}
