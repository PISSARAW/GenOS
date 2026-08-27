use crate::args::WorldProviderKind;
use anyhow::{bail, Context, Result};
use genos_core::{AgentGenome, AgentSnapshot, WorkingMemoryItem};
use genos_store::{LocalEventStore, LocalSnapshotStore, SnapshotStore};
use genos_world::{DirectoryWorldProvider, GitWorktreeWorldProvider, WorldProvider};
use std::fs;
use std::path::{Path, PathBuf};

/// Configuration for instantiating a `WorldProvider` from CLI args. Bundling
/// these into a struct keeps `provider_from_args` under the 3-parameter rule.
pub struct WorldProviderConfig {
    pub kind: WorldProviderKind,
    pub root: PathBuf,
    pub seed: Option<PathBuf>,
    pub repo: Option<PathBuf>,
    pub sandbox_config: Option<genos_world::sandbox::SandboxConfig>,
}

pub fn provider_from_args(config: WorldProviderConfig) -> Result<Box<dyn WorldProvider>> {
    let WorldProviderConfig {
        kind,
        root,
        seed,
        repo,
        sandbox_config,
    } = config;
    fs::create_dir_all(&root)?;

    match kind {
        WorldProviderKind::Directory => {
            let mut provider = DirectoryWorldProvider::new(root, seed)?;
            if let Some(cfg) = sandbox_config {
                provider = provider.with_sandbox(cfg);
            }
            Ok(Box::new(provider) as Box<dyn WorldProvider>)
        }
        WorldProviderKind::Hardlink => {
            Ok(Box::new(genos_world::HardlinkWorldProvider::new(root, seed)?) as Box<dyn WorldProvider>)
        }
        WorldProviderKind::GitWorktree => {
            let repo = repo.context("--repo is required for provider git-worktree")?;
            Ok(Box::new(GitWorktreeWorldProvider::new(root, repo)?) as Box<dyn WorldProvider>)
        }
    }
}

pub fn provider_name(kind: WorldProviderKind) -> &'static str {
    match kind {
        WorldProviderKind::Directory => "directory",
        WorldProviderKind::Hardlink => "hardlink",
        WorldProviderKind::GitWorktree => "git_worktree",
    }
}

pub async fn snapshot_store_from(store: Option<String>, root: &Path) -> Result<Box<dyn genos_store::SnapshotStore + Send + Sync>> {
    let s: Box<dyn genos_store::SnapshotStore + Send + Sync> = match store {
        Some(path) => {
            if path.starts_with("sqlite:") || path.starts_with("sqlite://") {
                Box::new(genos_store::SqliteStore::new(&path).await?)
            } else if path.starts_with("postgres:") || path.starts_with("postgres://") {
                Box::new(genos_store::PostgresStore::new(&path).await?)
            } else {
                Box::new(LocalSnapshotStore::new(PathBuf::from(path)))
            }
        },
        None => Box::new(LocalSnapshotStore::from_root(root)),
    };
    Ok(s)
}

pub fn event_store_from(events: Option<PathBuf>, root: &Path) -> LocalEventStore {
    match events {
        Some(path) => LocalEventStore::new(path),
        None => LocalEventStore::from_root(root),
    }
}

/// Resolve a snapshot reference given either as a file path or as a snapshot id
/// held in `store`, so callers can chain commands without knowing which form the
/// caller happens to have at hand.
pub async fn resolve_snapshot_ref(spec: &str, store: &(dyn SnapshotStore + Send + Sync)) -> Result<AgentSnapshot> {
    let path = Path::new(spec);
    if path.is_file() {
        return read_snapshot(path);
    }

    store
        .get_snapshot(spec.to_string())
        .await?
        .with_context(|| {
            format!(
                "snapshot '{spec}' is neither an existing file nor a snapshot id in the store"
            )
        })
}

/// Cognition weights are probabilities, so anything outside `0..=1` is a typo
/// rather than a decision.
pub fn unit_interval(raw: &str) -> Result<f32, String> {
    let value: f32 = raw
        .parse()
        .map_err(|_| format!("'{raw}' is not a number"))?;

    if !(0.0..=1.0).contains(&value) {
        return Err(format!("'{raw}' is outside 0..=1"));
    }

    Ok(value)
}

pub fn parse_working_memory_items(entries: &[String]) -> Result<Vec<WorkingMemoryItem>> {
    entries
        .iter()
        .map(|entry| {
            let (key, value) = entry
                .split_once('=')
                .with_context(|| format!("--memory expects KEY=VALUE, got '{entry}'"))?;
            if key.is_empty() {
                bail!("--memory expects a non-empty key, got '{entry}'");
            }
            Ok(WorkingMemoryItem {
                key: key.to_string(),
                value: value.to_string(),
            })
        })
        .collect()
}

pub fn read_genome(path: &Path) -> Result<AgentGenome> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed reading genome file {}", path.display()))?;
    if path.extension().and_then(|s| s.to_str()) == Some("json") {
        Ok(serde_json::from_str(&raw)?)
    } else {
        Ok(serde_yaml::from_str(&raw)?)
    }
}

pub fn read_snapshot(path: &Path) -> Result<AgentSnapshot> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed reading snapshot file {}", path.display()))?;
    if path.extension().and_then(|s| s.to_str()) == Some("json") {
        Ok(serde_json::from_str(&raw)?)
    } else {
        Ok(serde_yaml::from_str(&raw)?)
    }
}
