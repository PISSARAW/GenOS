use async_trait::async_trait;
use genos_core::{
    AgentEvent, AgentEventType, AgentId, AgentSnapshot, BranchId, EventId,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

#[async_trait]
pub trait EventStore: Send + Sync {
    async fn append(&self, event: AgentEvent) -> anyhow::Result<()>;
    async fn stream(&self, branch_id: Option<String>) -> anyhow::Result<Vec<AgentEvent>>;
}

#[async_trait]
pub trait SnapshotStore: Send + Sync {
    async fn save_snapshot(&self, snapshot: AgentSnapshot) -> anyhow::Result<()>;
    async fn get_snapshot(&self, snapshot_id: String) -> anyhow::Result<Option<AgentSnapshot>>;
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentLifecycle {
    Created,
    Running,
    Stopped,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BasicReplayState {
    pub agent_id: Option<AgentId>,
    pub branch_id: Option<BranchId>,
    pub lifecycle: AgentLifecycle,
    pub last_event_id: Option<EventId>,
    pub last_sequence: u64,
    pub steps: u64,
    pub model_calls: u64,
    pub tool_calls: u64,
    pub tool_failures: u64,
    pub snapshots_created: u64,
}

impl Default for BasicReplayState {
    fn default() -> Self {
        Self {
            agent_id: None,
            branch_id: None,
            lifecycle: AgentLifecycle::Created,
            last_event_id: None,
            last_sequence: 0,
            steps: 0,
            model_calls: 0,
            tool_calls: 0,
            tool_failures: 0,
            snapshots_created: 0,
        }
    }
}

pub fn replay_basic_state(events: &[AgentEvent]) -> BasicReplayState {
    let mut state = BasicReplayState::default();

    for event in events {
        state.agent_id = Some(event.agent_id.clone());
        state.branch_id = event.branch_id.clone();
        state.last_event_id = Some(event.event_id.clone());
        state.last_sequence = event.sequence;

        match event.event_type {
            AgentEventType::AgentCreated => {
                state.lifecycle = AgentLifecycle::Created;
            }
            AgentEventType::AgentStarted => {
                state.lifecycle = AgentLifecycle::Running;
            }
            AgentEventType::AgentStopped => {
                state.lifecycle = AgentLifecycle::Stopped;
            }
            AgentEventType::ModelResponded => {
                state.steps += 1;
                state.model_calls += 1;
            }
            AgentEventType::ToolCompleted => {
                state.tool_calls += 1;
            }
            AgentEventType::ToolFailed => {
                state.tool_calls += 1;
                state.tool_failures += 1;
            }
            AgentEventType::SnapshotCreated => {
                state.snapshots_created += 1;
            }
            _ => {}
        }
    }

    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use genos_core::{CorrelationId, EventId};
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_event(event_type: AgentEventType, sequence: u64, branch: &str) -> AgentEvent {
        AgentEvent {
            event_id: EventId::new(),
            agent_id: AgentId::new(),
            branch_id: Some(BranchId(branch.to_string())),
            sequence,
            timestamp: Utc::now(),
            event_type,
            payload: json!({"sequence": sequence}),
            causation_id: None,
            correlation_id: Some(CorrelationId::new()),
        }
    }

    fn temp_store_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time is before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("genos-store-test-{nanos}.jsonl"))
    }

    #[tokio::test]
    async fn local_store_is_append_only_and_ordered() {
        let path = temp_store_path();
        let store = LocalEventStore::new(&path);

        let e1 = make_event(AgentEventType::AgentCreated, 1, "branch-a");
        let e2 = make_event(AgentEventType::AgentStarted, 2, "branch-a");

        store.append(e1.clone()).await.expect("append e1 failed");
        store.append(e2.clone()).await.expect("append e2 failed");

        let all = store.stream(None).await.expect("stream failed");
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].event_id, e1.event_id);
        assert_eq!(all[1].event_id, e2.event_id);

        if fs::try_exists(&path).await.expect("try_exists failed") {
            fs::remove_file(path).await.expect("cleanup failed");
        }
    }

    #[tokio::test]
    async fn stream_filters_by_branch() {
        let path = temp_store_path();
        let store = LocalEventStore::new(&path);

        store
            .append(make_event(AgentEventType::AgentCreated, 1, "branch-a"))
            .await
            .expect("append branch-a failed");
        store
            .append(make_event(AgentEventType::AgentCreated, 1, "branch-b"))
            .await
            .expect("append branch-b failed");

        let only_a = store
            .stream(Some("branch-a".to_string()))
            .await
            .expect("stream branch-a failed");
        assert_eq!(only_a.len(), 1);
        assert_eq!(only_a[0].branch_id.as_ref().expect("missing branch").0, "branch-a");

        if fs::try_exists(&path).await.expect("try_exists failed") {
            fs::remove_file(path).await.expect("cleanup failed");
        }
    }

    #[test]
    fn replay_basic_state_accumulates_counters() {
        let events = vec![
            make_event(AgentEventType::AgentCreated, 1, "branch-a"),
            make_event(AgentEventType::AgentStarted, 2, "branch-a"),
            make_event(AgentEventType::ModelResponded, 3, "branch-a"),
            make_event(AgentEventType::ToolCompleted, 4, "branch-a"),
            make_event(AgentEventType::ToolFailed, 5, "branch-a"),
            make_event(AgentEventType::SnapshotCreated, 6, "branch-a"),
            make_event(AgentEventType::AgentStopped, 7, "branch-a"),
        ];

        let replay = replay_basic_state(&events);
        assert_eq!(replay.lifecycle, AgentLifecycle::Stopped);
        assert_eq!(replay.steps, 1);
        assert_eq!(replay.model_calls, 1);
        assert_eq!(replay.tool_calls, 2);
        assert_eq!(replay.tool_failures, 1);
        assert_eq!(replay.snapshots_created, 1);
        assert_eq!(replay.last_sequence, 7);
        assert!(replay.last_event_id.is_some());
    }
}
