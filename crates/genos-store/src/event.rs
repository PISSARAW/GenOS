use async_trait::async_trait;
use genos_core::AgentEvent;
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::replay::{replay_basic_state, BasicReplayState};

#[async_trait]
pub trait EventStore: Send + Sync {
    async fn append(&self, event: AgentEvent) -> anyhow::Result<()>;
    async fn stream(&self, branch_id: Option<String>) -> anyhow::Result<Vec<AgentEvent>>;
}

pub struct LocalEventStore {
    file_path: PathBuf,
    write_lock: Mutex<()>,
}

impl LocalEventStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        Self {
            file_path: file_path.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let file_path = root.as_ref().join("events").join("agent-events.jsonl");
        Self::new(file_path)
    }

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    pub async fn replay_basic_state(
        &self,
        branch_id: Option<String>,
    ) -> anyhow::Result<BasicReplayState> {
        let events = self.stream(branch_id).await?;
        Ok(replay_basic_state(&events))
    }
}

#[async_trait]
impl EventStore for LocalEventStore {
    async fn append(&self, event: AgentEvent) -> anyhow::Result<()> {
        let _guard = self.write_lock.lock().await;

        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await?;

        let mut line = serde_json::to_vec(&event)?;
        line.push(b'\n');
        file.write_all(&line).await?;
        file.flush().await?;
        Ok(())
    }

    async fn stream(&self, branch_id: Option<String>) -> anyhow::Result<Vec<AgentEvent>> {
        if !fs::try_exists(&self.file_path).await? {
            return Ok(Vec::new());
        }

        let raw = fs::read_to_string(&self.file_path).await?;
        let mut events = Vec::new();

        for (idx, line) in raw.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }

            let event: AgentEvent = serde_json::from_str(line)
                .map_err(|e| anyhow::anyhow!("invalid event at line {}: {e}", idx + 1))?;

            if let Some(filter_branch) = branch_id.as_deref() {
                let event_branch = event.branch_id.as_ref().map(|b| b.0.as_str());
                if event_branch != Some(filter_branch) {
                    continue;
                }
            }

            events.push(event);
        }

        Ok(events)
    }
}
