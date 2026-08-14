use async_trait::async_trait;
use genos_core::{
    AgentEvent, AgentEventType, AgentId, AgentSnapshot, BranchId, EventId,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
    replay_basic_state_from(BasicReplayState::default(), events)
}

pub fn basic_state_from_snapshot(snapshot: &AgentSnapshot) -> BasicReplayState {
    BasicReplayState {
        agent_id: Some(snapshot.agent_id.clone()),
        branch_id: Some(snapshot.branch_id.clone()),
        lifecycle: AgentLifecycle::Created,
        last_event_id: snapshot.state.event_cursor.last_event_id.clone(),
        last_sequence: snapshot.state.event_cursor.sequence,
        steps: snapshot.state.execution.step,
        model_calls: 0,
        tool_calls: 0,
        tool_failures: 0,
        snapshots_created: 0,
    }
}

pub fn replay_basic_state_from(mut state: BasicReplayState, events: &[AgentEvent]) -> BasicReplayState {

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
    use genos_core::{
        CorrelationId, EventCursor, ExecutionMetadata, GenomeId, GenomeRef, RuntimeMetadata,
        SnapshotId, ToolState, WorldId,
    };
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

    fn make_snapshot(sequence: u64) -> AgentSnapshot {
        let genome_id = GenomeId::new();
        let branch_id = BranchId::new();
        let world_id = WorldId::new();

        AgentSnapshot {
            snapshot_id: SnapshotId::new(),
            agent_id: AgentId::new(),
            branch_id: branch_id.clone(),
            genome: genos_core::AgentGenome {
                id: genome_id.clone(),
                version: genos_core::GenomeVersion("0.1.0".to_string()),
                identity: genos_core::Identity {
                    name: "test-agent".to_string(),
                    role: "tester".to_string(),
                },
                cognition: genos_core::CognitionConfig {
                    exploration: 0.5,
                    verification_threshold: 0.8,
                    planning_depth: 2,
                },
                objectives: vec![],
                policies: vec![],
                capabilities: vec![],
                memory_policy: genos_core::MemoryPolicy {
                    working_max_items: 16,
                    episodic_enabled: true,
                    semantic_enabled: true,
                },
                model_policy: genos_core::ModelPolicy {
                    strategy: "provider-agnostic".to_string(),
                    preferred_providers: vec![],
                    allow_local: true,
                },
                tool_policy: genos_core::ToolPolicy { permissions: vec![] },
            },
            state: genos_core::AgentState {
                genome: GenomeRef {
                    genome_id,
                    version: "0.1.0".to_string(),
                },
                working_memory: genos_core::WorkingMemory { items: vec![] },
                semantic_memory: genos_core::SemanticMemory { refs: vec![] },
                episodic_memory: genos_core::EpisodicMemory { refs: vec![] },
                beliefs: vec![],
                active_goals: vec![],
                world_id: world_id.clone(),
                event_cursor: EventCursor {
                    branch_id,
                    sequence,
                    last_event_id: None,
                },
                execution: ExecutionMetadata {
                    step: sequence,
                    last_model_provider: None,
                },
                artifact_refs: vec![],
            },
            world_id,
            tool_state: ToolState { active_tools: vec![] },
            runtime_metadata: RuntimeMetadata {
                runtime_version: "0.0.1".to_string(),
                budget_steps_remaining: 10,
            },
            created_at: Utc::now(),
        }
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

    #[test]
    fn replay_basic_state_from_snapshot_cursor() {
        let snapshot = make_snapshot(5);
        let base = basic_state_from_snapshot(&snapshot);
        assert_eq!(base.last_sequence, 5);
        assert_eq!(base.steps, 5);

        let events = vec![
            make_event(AgentEventType::ModelResponded, 6, &snapshot.branch_id.0),
            make_event(AgentEventType::ToolFailed, 7, &snapshot.branch_id.0),
        ];

        let replay = replay_basic_state_from(base, &events);
        assert_eq!(replay.last_sequence, 7);
        assert_eq!(replay.steps, 6);
        assert_eq!(replay.tool_calls, 1);
        assert_eq!(replay.tool_failures, 1);
    }

    #[tokio::test]
    async fn local_snapshot_store_save_and_get() {
        let path = temp_store_path();
        let store = LocalSnapshotStore::new(&path);
        let snapshot = make_snapshot(3);
        let snapshot_id = snapshot.snapshot_id.0.clone();

        store
            .save_snapshot(snapshot)
            .await
            .expect("save snapshot failed");

        let loaded = store
            .get_snapshot(snapshot_id)
            .await
            .expect("get snapshot failed");

        assert!(loaded.is_some());
        assert_eq!(
            loaded.expect("snapshot missing").state.execution.step,
            3
        );

        if fs::try_exists(&path).await.expect("try_exists failed") {
            fs::remove_file(path).await.expect("cleanup failed");
        }
    }

    #[tokio::test]
    async fn local_snapshot_store_returns_none_when_missing() {
        let path = temp_store_path();
        let store = LocalSnapshotStore::new(&path);

        let loaded = store
            .get_snapshot("does-not-exist".to_string())
            .await
            .expect("get snapshot failed");

        assert!(loaded.is_none());
    }

    #[tokio::test]
    async fn local_snapshot_store_lists_unique_ids() {
        let path = temp_store_path();
        let store = LocalSnapshotStore::new(&path);

        let snapshot1 = make_snapshot(1);
        let mut snapshot2 = make_snapshot(2);
        snapshot2.snapshot_id = snapshot1.snapshot_id.clone();
        let snapshot3 = make_snapshot(3);

        store
            .save_snapshot(snapshot1.clone())
            .await
            .expect("save snapshot1 failed");
        store
            .save_snapshot(snapshot2)
            .await
            .expect("save snapshot2 failed");
        store
            .save_snapshot(snapshot3.clone())
            .await
            .expect("save snapshot3 failed");

        let ids = store
            .list_snapshot_ids()
            .await
            .expect("list snapshot ids failed");

        assert_eq!(ids.len(), 2);
        assert_eq!(ids[0], snapshot1.snapshot_id.0);
        assert_eq!(ids[1], snapshot3.snapshot_id.0);

        if fs::try_exists(&path).await.expect("try_exists failed") {
            fs::remove_file(path).await.expect("cleanup failed");
        }
    }
}
