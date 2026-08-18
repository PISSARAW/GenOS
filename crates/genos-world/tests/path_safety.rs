//! Path-safety test: world-relative paths must not escape the world.

use genos_core::{AgentId, BranchId};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use tempfile::tempdir;

#[tokio::test]
async fn world_relative_paths_cannot_address_another_world() -> anyhow::Result<()> {
    let root = tempdir()?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), None)?;

    let victim = provider.create(AgentId::new(), BranchId::new()).await?;
    provider.write_file(&victim, "hello.txt", "hello").await?;
    let attacker = provider.create(AgentId::new(), BranchId::new()).await?;

    let escape = format!("../{}/hello.txt", victim.0);
    assert!(provider
        .write_file(&attacker, &escape, "owned")
        .await
        .is_err());
    assert!(provider.read_file(&attacker, &escape).await.is_err());
    assert!(provider.write_file(&attacker, "", "owned").await.is_err());

    // The neighbouring world is intact, and nothing was written next to it.
    assert_eq!(
        provider.read_file(&victim, "hello.txt").await?.as_deref(),
        Some("hello")
    );
    assert_eq!(provider.read_file(&attacker, "hello.txt").await?, None);

    Ok(())
}
