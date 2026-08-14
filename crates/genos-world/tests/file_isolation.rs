//! File-isolation tests — what the `files` module's check is for.
//!
//! These exercise the [`FileIsolationCheck`] builder and the free-function
//! `check_file_isolation` wrapper.

use genos_core::{AgentId, BranchId};
use genos_world::{
    check_file_isolation, DirectoryWorldProvider, FileIsolationCheck, WorldFileExpectation,
    WorldProvider,
};
use tempfile::tempdir;

/// The case this file-level check exists for: one world holding
/// `hello.txt = "hello"`, forked twice, each fork rewriting the file.
#[tokio::test]
async fn forked_worlds_write_the_same_file_differently() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    provider.write_file(&parent, "hello.txt", "hello").await?;

    let snapshot = provider.snapshot(parent.clone()).await?;
    let forks = provider.fork_many(snapshot.clone(), 2).await?;
    let (world_a, world_b) = (forks[0].clone(), forks[1].clone());

    // Both forks start from the parent's contents.
    assert_eq!(
        provider.read_file(&world_a, "hello.txt").await?.as_deref(),
        Some("hello")
    );
    assert_eq!(
        provider.read_file(&world_b, "hello.txt").await?.as_deref(),
        Some("hello")
    );

    provider.write_file(&world_a, "hello.txt", "bonjour").await?;
    provider.write_file(&world_b, "hello.txt", "hola").await?;

    assert_eq!(
        provider.read_file(&world_a, "hello.txt").await?.as_deref(),
        Some("bonjour")
    );
    assert_eq!(
        provider.read_file(&world_b, "hello.txt").await?.as_deref(),
        Some("hola")
    );
    assert_eq!(
        provider.read_file(&parent, "hello.txt").await?.as_deref(),
        Some("hello")
    );

    let report = check_file_isolation(
        &provider,
        "hello.txt",
        &WorldFileExpectation::holds(&parent, "hello"),
        &[
            WorldFileExpectation::holds(&world_a, "bonjour"),
            WorldFileExpectation::holds(&world_b, "hola"),
        ],
    )
    .await?;

    assert!(report.isolated, "{report:?}");
    assert!(report.parent_preserved);
    assert!(report.branches_hold_expected_contents);
    assert!(report.branch_contents_distinct);
    assert!(report.violations.is_empty());

    // The snapshot the forks came from is untouched too: a fork taken after
    // both writes still reads the original contents.
    let late_fork = provider.fork(snapshot).await?;
    assert_eq!(
        provider.read_file(&late_fork, "hello.txt").await?.as_deref(),
        Some("hello")
    );

    // Each pair differs by exactly the one file that diverged.
    assert_eq!(
        provider.diff(world_a.clone(), world_b.clone()).await?.files_changed,
        1
    );
    assert_eq!(provider.diff(parent, world_a).await?.files_changed, 1);

    Ok(())
}

#[tokio::test]
async fn a_new_file_in_one_world_does_not_appear_in_the_others() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    provider.write_file(&parent, "hello.txt", "hello").await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    let forks = provider.fork_many(snapshot, 2).await?;

    provider
        .write_file(&forks[0], "notes/draft.txt", "only in A")
        .await?;

    let report = check_file_isolation(
        &provider,
        "notes/draft.txt",
        &WorldFileExpectation::absent(&parent),
        &[
            WorldFileExpectation::holds(&forks[0], "only in A"),
            WorldFileExpectation::absent(&forks[1]),
        ],
    )
    .await?;

    assert!(report.isolated, "{report:?}");
    assert_eq!(report.parent.actual_contents, None);
    assert_eq!(report.branches[1].actual_contents, None);

    Ok(())
}

#[tokio::test]
async fn report_flags_a_write_that_reached_the_parent() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    provider.write_file(&parent, "hello.txt", "hello").await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    let forks = provider.fork_many(snapshot, 2).await?;

    provider.write_file(&forks[0], "hello.txt", "bonjour").await?;
    provider.write_file(&forks[1], "hello.txt", "hola").await?;
    // Stand-in for a leak: the parent ends up with a branch's contents.
    provider.write_file(&parent, "hello.txt", "bonjour").await?;

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

    assert!(!report.isolated);
    assert!(!report.parent_preserved);
    assert!(report.branches_hold_expected_contents);
    assert_eq!(report.violations.len(), 1);
    assert!(report.violations[0].contains("\"hello\""));
    assert!(report.violations[0].contains("holds \"bonjour\""));

    Ok(())
}

#[tokio::test]
async fn report_flags_worlds_that_did_not_diverge() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    provider.write_file(&parent, "hello.txt", "hello").await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    let forks = provider.fork_many(snapshot, 2).await?;

    provider.write_file(&forks[0], "hello.txt", "bonjour").await?;
    provider.write_file(&forks[1], "hello.txt", "bonjour").await?;

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

    assert!(!report.isolated);
    assert!(report.parent_preserved);
    assert!(!report.branches_hold_expected_contents);
    assert!(!report.branch_contents_distinct);
    assert_eq!(report.violations.len(), 2);

    Ok(())
}

#[tokio::test]
async fn file_isolation_check_struct_works() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    provider.write_file(&parent, "hello.txt", "hello").await?;
    let snapshot = provider.snapshot(parent.clone()).await?;
    let forks = provider.fork_many(snapshot, 2).await?;

    provider.write_file(&forks[0], "hello.txt", "bonjour").await?;
    provider.write_file(&forks[1], "hello.txt", "hola").await?;

    let report = FileIsolationCheck::new(
        &provider,
        "hello.txt",
        &WorldFileExpectation::holds(&parent, "hello"),
        &[
            WorldFileExpectation::holds(&forks[0], "bonjour"),
            WorldFileExpectation::holds(&forks[1], "hola"),
        ],
    )
    .run()
    .await?;

    assert!(report.isolated, "{report:?}");
    Ok(())
}
