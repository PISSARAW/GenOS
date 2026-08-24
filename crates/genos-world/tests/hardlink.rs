//! Copy-on-write fork behaviour: hardlink forks, manifest snapshots, fallback
//! and the merge proposal surface.

use genos_core::{AgentId, BranchId};
use genos_world::{DirectoryWorldProvider, HardlinkWorldProvider, WorldProvider};
use std::fs;
use tempfile::tempdir;

#[tokio::test]
async fn forks_share_inodes_until_a_write_diverges_them() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    fs::create_dir_all(&seed)?;
    fs::write(seed.join("payload.txt"), "zero-copy")?;

    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    let fork = provider.fork(snapshot.clone()).await?;

    let payload = root
        .path()
        .join("state/snapshots")
        .join(&snapshot.0)
        .join("files")
        .join("payload.txt");
    let forked = provider.world_path(&fork)?.join("payload.txt");

    // The fork is a link to the snapshot payload, not a byte-for-byte copy.
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let a = fs::metadata(&payload)?;
        let b = fs::metadata(&forked)?;
        assert_eq!((a.dev(), a.ino()), (b.dev(), b.ino()));
    }
    #[cfg(not(unix))]
    {
        assert!(forked.is_file());
    }

    // First provider-mediated write privatizes the inode…
    provider
        .write_file(&fork, "payload.txt", "diverged")
        .await?;
    // …and nothing leaks into the snapshot or the parent world.
    assert_eq!(fs::read_to_string(&payload)?, "zero-copy");
    assert_eq!(
        provider.read_file(&parent, "payload.txt").await?.as_deref(),
        Some("zero-copy")
    );

    Ok(())
}

#[tokio::test]
async fn fork_falls_back_when_payload_entry_is_missing() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    fs::create_dir_all(&seed)?;
    fs::write(seed.join("keep.txt"), "still here")?;

    let provider = HardlinkWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent.clone()).await?;

    let payload_file = root
        .path()
        .join("state/snapshots")
        .join(&snapshot.0)
        .join("files")
        .join("keep.txt");
    fs::remove_file(&payload_file)?;

    // The manifest still names the originating world, so the fork recovers.
    let fork = provider.fork(snapshot).await?;
    assert_eq!(
        provider.read_file(&fork, "keep.txt").await?.as_deref(),
        Some("still here")
    );
    Ok(())
}

#[tokio::test]
async fn snapshots_outlive_their_world_and_feed_many_forks() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    fs::create_dir_all(&seed)?;
    fs::write(seed.join("README.md"), "durable")?;

    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    provider.destroy(parent).await?;

    let worlds = provider.fork_many(snapshot, 5).await?;
    assert_eq!(worlds.len(), 5);
    for world in &worlds {
        assert_eq!(
            provider.read_file(world, "README.md").await?.as_deref(),
            Some("durable")
        );
    }
    Ok(())
}

#[tokio::test]
async fn merge_into_reports_divergence_from_fork_origin() -> anyhow::Result<()> {
    let root = tempdir()?;
    let seed = root.path().join("seed");
    fs::create_dir_all(&seed)?;
    fs::create_dir_all(seed.join("src"))?;
    fs::write(seed.join("src/app.rs"), "fn main() {}")?;
    fs::write(seed.join("notes.txt"), "scratch")?;

    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent).await?;
    let fork = provider.fork(snapshot).await?;

    provider
        .write_file(&fork, "src/app.rs", "fn main() { println!(\"hi\"); }")
        .await?;
    provider
        .write_file(&fork, "docs/design.md", "# design")
        .await?;
    let delete = if cfg!(windows) {
        "del notes.txt"
    } else {
        "rm notes.txt"
    };
    provider.execute(fork.clone(), delete).await.ok();

    let proposal = provider.merge_into(fork, "main").await?;
    assert!(!proposal.applied);
    assert_eq!(proposal.target_branch, "main");
    assert!(proposal.files_changed.contains(&"src/app.rs".to_string()));
    assert!(proposal
        .files_changed
        .contains(&"docs/design.md".to_string()));
    Ok(())
}

#[tokio::test]
async fn merge_into_without_origin_is_an_error_not_a_silent_noop() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;
    let world = provider.create(AgentId::new(), BranchId::new()).await?;
    assert!(provider.merge_into(world, "main").await.is_err());
    Ok(())
}
