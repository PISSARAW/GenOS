use async_trait::async_trait;
use genos_core::AgentSnapshot;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

#[async_trait]
pub trait SnapshotStore: Send + Sync {
    async fn save_snapshot(&self, snapshot: AgentSnapshot) -> anyhow::Result<()>;
    async fn get_snapshot(&self, snapshot_id: String) -> anyhow::Result<Option<AgentSnapshot>>;
}

pub struct LocalSnapshotStore {
    file_path: PathBuf,
    write_lock: Mutex<()>,
}

impl LocalSnapshotStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        Self {
            file_path: file_path.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let file_path = root
            .as_ref()
            .join("snapshots")
            .join("agent-snapshots.jsonl");
        Self::new(file_path)
    }

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    pub async fn list_snapshot_ids(&self) -> anyhow::Result<Vec<String>> {
        if !fs::try_exists(&self.file_path).await? {
            return Ok(Vec::new());
        }

        let raw = fs::read_to_string(&self.file_path).await?;
        let mut ids = Vec::new();
        let mut seen = HashSet::new();

        for (idx, line) in raw.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }

            let snapshot: AgentSnapshot = serde_json::from_str(line)
                .map_err(|e| anyhow::anyhow!("invalid snapshot at line {}: {e}", idx + 1))?;

            if seen.insert(snapshot.snapshot_id.0.clone()) {
                ids.push(snapshot.snapshot_id.0);
            }
        }

        Ok(ids)
    }
}

#[async_trait]
impl SnapshotStore for LocalSnapshotStore {
    async fn save_snapshot(&self, snapshot: AgentSnapshot) -> anyhow::Result<()> {
        let _guard = self.write_lock.lock().await;

        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await?;

        let mut line = serde_json::to_vec(&snapshot)?;
        line.push(b'\n');
        file.write_all(&line).await?;
        file.flush().await?;
        Ok(())
    }

    async fn get_snapshot(&self, snapshot_id: String) -> anyhow::Result<Option<AgentSnapshot>> {
        if !fs::try_exists(&self.file_path).await? {
            return Ok(None);
        }

        let raw = fs::read_to_string(&self.file_path).await?;
        let mut found: Option<AgentSnapshot> = None;

        for (idx, line) in raw.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }

            let snapshot: AgentSnapshot = serde_json::from_str(line)
                .map_err(|e| anyhow::anyhow!("invalid snapshot at line {}: {e}", idx + 1))?;

            if snapshot.snapshot_id.0 == snapshot_id {
                found = Some(snapshot);
            }
        }

        Ok(found)
    }
}
