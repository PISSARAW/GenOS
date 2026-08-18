use async_trait::async_trait;
use genos_core::{
    AgentEvent, AgentEventType, AgentId, AgentSnapshot, AgentWorldCapsule, ArtifactRef, BranchId,
    CapsuleId, DigestAlgorithm, EventId,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
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

#[async_trait]
pub trait CapsuleStore: Send + Sync {
    async fn save_capsule(&self, capsule: AgentWorldCapsule) -> anyhow::Result<()>;
    async fn get_capsule(&self, capsule_id: String) -> anyhow::Result<Option<AgentWorldCapsule>>;
    async fn list_branch_capsules(
        &self,
        branch_id: String,
    ) -> anyhow::Result<Vec<AgentWorldCapsule>>;
}

pub struct LocalCapsuleStore {
    file_path: PathBuf,
    write_lock: Mutex<()>,
}

impl LocalCapsuleStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        Self {
            file_path: file_path.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        Self::new(
            root.as_ref()
                .join("capsules")
                .join("agent-world-capsules.jsonl"),
        )
    }

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    async fn read_all(&self) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        if !fs::try_exists(&self.file_path).await? {
            return Ok(vec![]);
        }
        let raw = fs::read_to_string(&self.file_path).await?;
        raw.lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty())
            .map(|(index, line)| {
                let capsule: AgentWorldCapsule = serde_json::from_str(line).map_err(|error| {
                    anyhow::anyhow!("invalid capsule at line {}: {error}", index + 1)
                })?;
                if !capsule.verify_integrity() {
                    anyhow::bail!(
                        "capsule {} failed integrity verification",
                        capsule.capsule_id.0
                    );
                }
                Ok(capsule)
            })
            .collect()
    }
}

#[async_trait]
impl CapsuleStore for LocalCapsuleStore {
    async fn save_capsule(&self, capsule: AgentWorldCapsule) -> anyhow::Result<()> {
        if !capsule.verify_integrity() {
            anyhow::bail!("refusing to store capsule with invalid integrity digest");
        }
        let _guard = self.write_lock.lock().await;
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await?;
        let mut line = serde_json::to_vec(&capsule)?;
        line.push(b'\n');
        file.write_all(&line).await?;
        file.flush().await?;
        Ok(())
    }

    async fn get_capsule(&self, capsule_id: String) -> anyhow::Result<Option<AgentWorldCapsule>> {
        let id = CapsuleId(capsule_id);
        Ok(self
            .read_all()
            .await?
            .into_iter()
            .rev()
            .find(|capsule| capsule.capsule_id == id))
    }

    async fn list_branch_capsules(
        &self,
        branch_id: String,
    ) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        Ok(self
            .read_all()
            .await?
            .into_iter()
            .filter(|capsule| capsule.branch_id.0 == branch_id)
            .collect())
    }
}

/// Content-addressed local artifact store. The SHA-256 digest is the physical
/// identity, so identical artifacts across branches share one stored blob.
pub struct LocalArtifactStore {
    root: PathBuf,
    write_lock: Mutex<()>,
}

/// Content-addressed manifest for the reusable parts of a snapshot. Branch
/// identity and event cursor remain per-snapshot; equal components share blobs.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotComponentManifest {
    pub snapshot_id: String,
    pub genome: ArtifactRef,
    pub working_memory: ArtifactRef,
    pub memories: ArtifactRef,
    pub beliefs: ArtifactRef,
    pub tool_outputs: ArtifactRef,
    pub tool_state: ArtifactRef,
    pub runtime_metadata: ArtifactRef,
}

pub struct LocalSnapshotComponentStore {
    artifacts: LocalArtifactStore,
}

impl LocalSnapshotComponentStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            artifacts: LocalArtifactStore::new(root),
        }
    }

    async fn put_json<T: Serialize>(&self, value: &T) -> anyhow::Result<ArtifactRef> {
        self.artifacts
            .put(&serde_json::to_vec(value)?, "application/json")
            .await
    }

    pub async fn store_components(
        &self,
        snapshot: &AgentSnapshot,
    ) -> anyhow::Result<SnapshotComponentManifest> {
        Ok(SnapshotComponentManifest {
            snapshot_id: snapshot.snapshot_id.0.clone(),
            genome: self.put_json(&snapshot.genome).await?,
            working_memory: self.put_json(&snapshot.state.working_memory).await?,
            memories: self.put_json(&snapshot.state.memories).await?,
            beliefs: self.put_json(&snapshot.state.beliefs).await?,
            tool_outputs: self.put_json(&snapshot.state.tool_outputs).await?,
            tool_state: self.put_json(&snapshot.tool_state).await?,
            runtime_metadata: self.put_json(&snapshot.runtime_metadata).await?,
        })
    }

    pub fn component_path(&self, digest: &str) -> PathBuf {
        self.artifacts.blob_path(digest)
    }
}

impl LocalArtifactStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn blob_path(&self, digest: &str) -> PathBuf {
        self.root.join("sha256").join(digest)
    }

    pub async fn put(
        &self,
        bytes: &[u8],
        media_type: impl Into<String>,
    ) -> anyhow::Result<ArtifactRef> {
        let digest = format!("{:x}", Sha256::digest(bytes));
        let path = self.blob_path(&digest);
        let _guard = self.write_lock.lock().await;
        if !fs::try_exists(&path).await? {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::write(&path, bytes).await?;
        }
        Ok(ArtifactRef {
            algorithm: DigestAlgorithm::Sha256,
            digest,
            media_type: media_type.into(),
            size: bytes.len() as u64,
        })
    }
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
#[serde(rename_all = "snake_case")]
pub enum BranchStatus {
    Active,
    Completed,
    Interrupted,
    BudgetExhausted,
    TimedOut,
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
    /// Variables reconstructed from memory events, independently of a snapshot.
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
    pub branch_status: BranchStatus,
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
            variables: BTreeMap::new(),
            branch_status: BranchStatus::Active,
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
        variables: snapshot
            .state
            .working_memory
            .items
            .iter()
            .map(|item| (item.key.clone(), item.value.clone()))
            .collect(),
        branch_status: BranchStatus::Active,
    }
}

pub fn replay_basic_state_from(
    mut state: BasicReplayState,
    events: &[AgentEvent],
) -> BasicReplayState {
    for event in events {
        state.agent_id = Some(event.agent_id.clone());
        state.branch_id = event.branch_id.clone();
        state.last_event_id = Some(event.event_id.clone());
        state.last_sequence = event.sequence;

        match event.event_type {
            AgentEventType::AgentStep => {
                state.lifecycle = AgentLifecycle::Running;
                state.steps += 1;
            }
            AgentEventType::ForkCompleted => {
                state.branch_status = BranchStatus::Completed;
            }
            AgentEventType::ForkCreated
            | AgentEventType::ForkStarted
            | AgentEventType::WorldCreated => {
                state.branch_status = BranchStatus::Active;
            }
            AgentEventType::ToolRequested => {
                state.branch_status = BranchStatus::Active;
            }
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
                if event
                    .payload
                    .get("max_steps")
                    .and_then(|value| value.as_u64())
                    .is_some_and(|max_steps| state.steps >= max_steps)
                {
                    state.branch_status = BranchStatus::BudgetExhausted;
                    state.lifecycle = AgentLifecycle::Stopped;
                }
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
            AgentEventType::MemoryCreated | AgentEventType::MemoryUpdated => {
                if let (Some(key), Some(value)) = (
                    event.payload.get("key").and_then(|value| value.as_str()),
                    event.payload.get("value").and_then(|value| value.as_str()),
                ) {
                    state.variables.insert(key.to_string(), value.to_string());
                }
            }
            _ => {}
        }
    }

    // A restart can only observe the durable prefix. An outstanding request
    // means the branch did not complete and must remain visible as interrupted.
    if state.branch_status != BranchStatus::BudgetExhausted
        && events
            .last()
            .is_some_and(|event| event.event_type == AgentEventType::ToolRequested)
    {
        state.branch_status = BranchStatus::Interrupted;
    }

    if let (Some(first), Some(last), Some(max_duration)) = (
        events.first().map(|event| event.timestamp),
        events.last().map(|event| event.timestamp),
        events.iter().find_map(|event| {
            event
                .payload
                .get("max_duration_seconds")
                .and_then(|value| value.as_i64())
        }),
    ) {
        if (last - first).num_seconds() >= max_duration {
            state.branch_status = BranchStatus::TimedOut;
            state.lifecycle = AgentLifecycle::Stopped;
        }
    }

    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use genos_core::{
        CorrelationId, EventCursor, ExecutionMetadata, GenomeId, GenomeRef, RuntimeMetadata,
        SnapshotId, ToolState, WorldId,
    };
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEMP_STORE_ID: AtomicU64 = AtomicU64::new(0);

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
        let sequence = NEXT_TEMP_STORE_ID.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "genos-store-test-{}-{nanos}-{sequence}.jsonl",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn identical_branch_artifacts_share_one_physical_blob() {
        let root = temp_store_path().with_extension("artifacts");
        let store = LocalArtifactStore::new(&root);
        let bytes = b"same generated file";

        let reference_a = store
            .put(bytes, "text/plain")
            .await
            .expect("store A failed");
        let reference_b = store
            .put(bytes, "text/plain")
            .await
            .expect("store B failed");

        assert_eq!(reference_a.digest, reference_b.digest);
        assert_eq!(reference_a.digest, format!("{:x}", Sha256::digest(bytes)));
        assert!(fs::try_exists(store.blob_path(&reference_a.digest))
            .await
            .expect("blob lookup failed"));
        let mut entries = fs::read_dir(root.join("sha256"))
            .await
            .expect("artifact directory missing");
        assert!(entries
            .next_entry()
            .await
            .expect("read entry failed")
            .is_some());
        assert!(entries
            .next_entry()
            .await
            .expect("read entry failed")
            .is_none());

        fs::remove_dir_all(&root)
            .await
            .expect("artifact cleanup failed");
    }

    #[tokio::test]
    async fn similar_snapshots_share_identical_components() {
        let root = temp_store_path().with_extension("snapshot-components");
        let store = LocalSnapshotComponentStore::new(&root);
        let parent = make_snapshot(0);
        let s1 = genos_core::fork_snapshot(&parent);
        let s2 = genos_core::fork_snapshot(&parent);

        let manifest_1 = store.store_components(&s1).await.expect("store S1 failed");
        let manifest_2 = store.store_components(&s2).await.expect("store S2 failed");

        assert_ne!(manifest_1.snapshot_id, manifest_2.snapshot_id);
        assert_eq!(manifest_1.genome.digest, manifest_2.genome.digest);
        assert_eq!(
            manifest_1.working_memory.digest,
            manifest_2.working_memory.digest
        );
        assert_eq!(manifest_1.memories.digest, manifest_2.memories.digest);
        assert_eq!(
            manifest_1.runtime_metadata.digest,
            manifest_2.runtime_metadata.digest
        );
        assert!(
            fs::try_exists(store.component_path(&manifest_1.genome.digest))
                .await
                .expect("genome blob missing")
        );

        fs::remove_dir_all(&root)
            .await
            .expect("component cleanup failed");
    }

    fn make_snapshot(sequence: u64) -> AgentSnapshot {
        let genome_id = GenomeId::new();
        let branch_id = BranchId::new();
        let world_id = WorldId::new();

        AgentSnapshot {
            snapshot_id: SnapshotId::new(),
            agent_id: AgentId::new(),
            branch_id: branch_id.clone(),
            branch_metadata: genos_core::BranchMetadata::default(),
            genome: genos_core::AgentGenome {
                id: genome_id.clone(),
                parent_genome: None,
                parent_genomes: vec![],
                mutation: None,
                version: genos_core::GenomeVersion("0.1.0".to_string()),
                identity: genos_core::Identity {
                    name: "test-agent".to_string(),
                    role: "tester".to_string(),
                },
                cognition: genos_core::CognitionConfig {
                    drives: {
                        let mut d = std::collections::BTreeMap::new();
                        d.insert("exploration".to_string(), 0.5);
                        d.insert("risk_tolerance".to_string(), 0.25);
                        d.insert("verification_threshold".to_string(), 0.8);
                        d
                    },
                    planning_depth: 4,
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
                tool_policy: genos_core::ToolPolicy {
                    permissions: vec![],
                },
                inferred_traits: vec![],
                breeding: None,
            },
            state: genos_core::AgentState {
                genome: GenomeRef {
                    genome_id,
                    version: "0.1.0".to_string(),
                },
                working_memory: genos_core::WorkingMemory { items: vec![] },
                semantic_memory: genos_core::SemanticMemory { refs: vec![] },
                episodic_memory: genos_core::EpisodicMemory { refs: vec![] },
                memories: vec![],
                tool_outputs: vec![],
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
            tool_state: ToolState {
                active_tools: vec![],
            },
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
        assert_eq!(
            only_a[0].branch_id.as_ref().expect("missing branch").0,
            "branch-a"
        );

        if fs::try_exists(&path).await.expect("try_exists failed") {
            fs::remove_file(path).await.expect("cleanup failed");
        }
    }

    #[test]
    fn replay_basic_state_accumulates_counters() {
        let events = vec![
            make_event(AgentEventType::AgentCreated, 1, "branch-a"),
            make_event(AgentEventType::AgentStarted, 2, "branch-a"),
            make_event(AgentEventType::AgentStep, 3, "branch-a"),
            make_event(AgentEventType::ModelResponded, 4, "branch-a"),
            make_event(AgentEventType::ToolCompleted, 5, "branch-a"),
            make_event(AgentEventType::ToolFailed, 6, "branch-a"),
            make_event(AgentEventType::SnapshotCreated, 7, "branch-a"),
            make_event(AgentEventType::AgentStopped, 8, "branch-a"),
        ];

        let replay = replay_basic_state(&events);
        assert_eq!(replay.lifecycle, AgentLifecycle::Stopped);
        assert_eq!(replay.steps, 2);
        assert_eq!(replay.model_calls, 1);
        assert_eq!(replay.tool_calls, 2);
        assert_eq!(replay.tool_failures, 1);
        assert_eq!(replay.snapshots_created, 1);
        assert_eq!(replay.last_sequence, 8);
        assert!(replay.last_event_id.is_some());
    }

    #[test]
    fn replay_rebuilds_materialized_state_without_reexecution() {
        let mut events = Vec::new();
        for (sequence, (event_type, value)) in [
            (AgentEventType::MemoryCreated, "0"),
            (AgentEventType::MemoryUpdated, "1"),
            (AgentEventType::MemoryUpdated, "2"),
            (AgentEventType::MemoryUpdated, "7"),
        ]
        .into_iter()
        .enumerate()
        {
            let mut event = make_event(event_type, sequence as u64 + 1, "branch-a");
            event.payload = json!({
                "key": "counter",
                "value": value,
            });
            events.push(event);
        }

        // The materialized snapshot is gone: replay starts from an empty state
        // and applies only the recorded state transitions.
        let replay = replay_basic_state(&events);
        assert_eq!(
            replay.variables.get("counter").map(String::as_str),
            Some("7")
        );
        assert_eq!(replay.last_sequence, 4);
    }

    #[test]
    fn replay_marks_crashed_branch_as_interrupted() {
        let events = [
            AgentEventType::ForkCreated,
            AgentEventType::WorldCreated,
            AgentEventType::AgentStarted,
            AgentEventType::ToolRequested,
        ]
        .into_iter()
        .enumerate()
        .map(|(index, event_type)| make_event(event_type, index as u64 + 1, "branch-a"))
        .collect::<Vec<_>>();

        // Simulate restart: only the durable event prefix is available and
        // there is no completion event after the tool request.
        let replay = replay_basic_state(&events);
        assert_eq!(replay.branch_status, BranchStatus::Interrupted);
        assert_eq!(replay.last_sequence, 4);
    }

    #[test]
    fn branch_stops_cleanly_when_its_step_budget_is_exhausted() {
        fn model_steps(branch: &str, count: u64, max_steps: u64) -> Vec<AgentEvent> {
            (1..=count)
                .map(|sequence| {
                    let mut event = make_event(AgentEventType::ModelResponded, sequence, branch);
                    event.payload = json!({ "max_steps": max_steps });
                    event
                })
                .collect()
        }

        let branch_a = replay_basic_state(&model_steps("branch-a", 5, 5));
        let branch_b = replay_basic_state(&model_steps("branch-b", 5, 10));

        assert_eq!(branch_a.steps, 5);
        assert_eq!(branch_a.branch_status, BranchStatus::BudgetExhausted);
        assert_eq!(branch_a.lifecycle, AgentLifecycle::Stopped);
        assert_eq!(branch_b.branch_status, BranchStatus::Active);
    }

    #[test]
    fn branch_stops_cleanly_when_its_duration_budget_expires() {
        let started_at = Utc::now();
        let mut start = make_event(AgentEventType::AgentStarted, 1, "branch-a");
        start.timestamp = started_at;
        start.payload = json!({ "max_duration_seconds": 10 });

        let mut after_timeout = make_event(AgentEventType::ModelResponded, 2, "branch-a");
        after_timeout.timestamp = started_at + Duration::seconds(10);
        after_timeout.payload = json!({ "max_duration_seconds": 10 });

        let replay = replay_basic_state(&[start, after_timeout]);
        assert_eq!(replay.branch_status, BranchStatus::TimedOut);
        assert_eq!(replay.lifecycle, AgentLifecycle::Stopped);
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
        assert_eq!(loaded.expect("snapshot missing").state.execution.step, 3);

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

    #[tokio::test]
    async fn clone_without_llm_starts_identical_but_has_distinct_identity_and_streams() {
        let events_path = temp_store_path();
        let snapshots_path = temp_store_path();
        let event_store = LocalEventStore::new(&events_path);
        let snapshot_store = LocalSnapshotStore::new(&snapshots_path);

        let mut parent = make_snapshot(0);
        parent
            .state
            .working_memory
            .items
            .push(genos_core::WorkingMemoryItem {
                key: "seed_note".to_string(),
                value: "minimal-memory".to_string(),
            });
        parent
            .state
            .semantic_memory
            .refs
            .push(genos_core::MemoryId::new());

        snapshot_store
            .save_snapshot(parent.clone())
            .await
            .expect("save parent snapshot failed");

        let clone_a1 = genos_core::fork_snapshot(&parent);
        let clone_a2 = genos_core::fork_snapshot(&parent);

        snapshot_store
            .save_snapshot(clone_a1.clone())
            .await
            .expect("save clone_a1 snapshot failed");
        snapshot_store
            .save_snapshot(clone_a2.clone())
            .await
            .expect("save clone_a2 snapshot failed");

        assert_eq!(clone_a1.genome, clone_a2.genome);
        assert_eq!(clone_a1.state.working_memory, clone_a2.state.working_memory);
        assert_eq!(
            clone_a1.state.semantic_memory,
            clone_a2.state.semantic_memory
        );
        assert_eq!(
            clone_a1.state.episodic_memory,
            clone_a2.state.episodic_memory
        );
        assert_eq!(clone_a1.state.beliefs, clone_a2.state.beliefs);
        assert_eq!(clone_a1.state.active_goals, clone_a2.state.active_goals);
        assert_eq!(clone_a1.state.execution, clone_a2.state.execution);
        assert_eq!(clone_a1.state.artifact_refs, clone_a2.state.artifact_refs);
        assert_eq!(
            clone_a1.state.event_cursor.sequence,
            clone_a2.state.event_cursor.sequence
        );
        assert_eq!(
            clone_a1.state.event_cursor.last_event_id,
            clone_a2.state.event_cursor.last_event_id
        );

        assert_ne!(clone_a1.agent_id, clone_a2.agent_id);
        assert_ne!(clone_a1.branch_id, clone_a2.branch_id);
        assert_eq!(clone_a1.branch_id, clone_a1.state.event_cursor.branch_id);
        assert_eq!(clone_a2.branch_id, clone_a2.state.event_cursor.branch_id);

        let a1_event_created = AgentEvent {
            event_id: EventId::new(),
            agent_id: clone_a1.agent_id.clone(),
            branch_id: Some(clone_a1.branch_id.clone()),
            sequence: 1,
            timestamp: Utc::now(),
            event_type: AgentEventType::ForkCreated,
            payload: json!({ "parent_snapshot_id": parent.snapshot_id.0 }),
            causation_id: None,
            correlation_id: Some(CorrelationId::new()),
        };
        let a2_event_created = AgentEvent {
            event_id: EventId::new(),
            agent_id: clone_a2.agent_id.clone(),
            branch_id: Some(clone_a2.branch_id.clone()),
            sequence: 1,
            timestamp: Utc::now(),
            event_type: AgentEventType::ForkCreated,
            payload: json!({ "parent_snapshot_id": parent.snapshot_id.0 }),
            causation_id: None,
            correlation_id: Some(CorrelationId::new()),
        };

        event_store
            .append(a1_event_created)
            .await
            .expect("append clone_a1 event failed");
        event_store
            .append(a2_event_created)
            .await
            .expect("append clone_a2 event failed");

        let stream_a1 = event_store
            .stream(Some(clone_a1.branch_id.0.clone()))
            .await
            .expect("stream clone_a1 failed");
        let stream_a2 = event_store
            .stream(Some(clone_a2.branch_id.0.clone()))
            .await
            .expect("stream clone_a2 failed");

        assert_eq!(stream_a1.len(), 1);
        assert_eq!(stream_a2.len(), 1);
        assert_eq!(stream_a1[0].agent_id, clone_a1.agent_id);
        assert_eq!(stream_a2[0].agent_id, clone_a2.agent_id);
        assert_eq!(
            stream_a1[0]
                .branch_id
                .as_ref()
                .expect("missing branch for a1"),
            &clone_a1.branch_id
        );
        assert_eq!(
            stream_a2[0]
                .branch_id
                .as_ref()
                .expect("missing branch for a2"),
            &clone_a2.branch_id
        );
        assert_ne!(stream_a1[0].event_id, stream_a2[0].event_id);

        if fs::try_exists(&events_path)
            .await
            .expect("try_exists events failed")
        {
            fs::remove_file(events_path)
                .await
                .expect("cleanup events failed");
        }
        if fs::try_exists(&snapshots_path)
            .await
            .expect("try_exists snapshots failed")
        {
            fs::remove_file(snapshots_path)
                .await
                .expect("cleanup snapshots failed");
        }
    }

    /// A memory recorded on one branch is held by that branch only, and the
    /// provenance travels with it through the store.
    #[tokio::test]
    async fn a_memory_recorded_on_one_branch_survives_a_store_round_trip() {
        let events_path = temp_store_path();
        let snapshots_path = temp_store_path();
        let event_store = LocalEventStore::new(&events_path);
        let snapshot_store = LocalSnapshotStore::new(&snapshots_path);

        const FACT: &str = "The API uses PostgreSQL";

        let parent = make_snapshot(0);
        assert!(parent.state.memories.is_empty());
        snapshot_store
            .save_snapshot(parent.clone())
            .await
            .expect("save parent snapshot failed");

        let mut a = genos_core::fork_snapshot(&parent);
        let b = genos_core::fork_snapshot(&parent);

        let write = genos_core::add_memory_on_branch(
            &mut a,
            genos_core::MemoryKind::Semantic,
            FACT,
            Some("schema-probe"),
        );
        event_store
            .append(write.event)
            .await
            .expect("append memory event failed");
        snapshot_store
            .save_snapshot(a.clone())
            .await
            .expect("save a snapshot failed");
        snapshot_store
            .save_snapshot(b.clone())
            .await
            .expect("save b snapshot failed");

        let stored_parent = snapshot_store
            .get_snapshot(parent.snapshot_id.0.clone())
            .await
            .expect("get parent failed")
            .expect("parent missing");
        let stored_a = snapshot_store
            .get_snapshot(a.snapshot_id.0.clone())
            .await
            .expect("get a failed")
            .expect("a missing");
        let stored_b = snapshot_store
            .get_snapshot(b.snapshot_id.0.clone())
            .await
            .expect("get b failed")
            .expect("b missing");

        let recorded = stored_a
            .memory(&write.record.id)
            .expect("memory missing from its own branch");
        assert_eq!(recorded.content, FACT);
        assert_eq!(recorded.created_in, stored_a.branch_id);
        assert_eq!(recorded.source.as_deref(), Some("schema-probe"));
        assert!(stored_a
            .state
            .semantic_memory
            .refs
            .contains(&write.record.id));

        assert!(stored_b.state.memories.is_empty());
        assert!(stored_b.state.semantic_memory.refs.is_empty());
        assert!(stored_parent.state.memories.is_empty());

        // The diff between the two branches names the added memory, on the side
        // that recorded it, with where it came from.
        let diff = genos_core::diff_snapshots(&stored_b, &stored_a);
        let entry = diff
            .memory_diff
            .iter()
            .find(|entry| entry.path == format!("state.memories.{}", write.record.id.0))
            .expect("no entry for the added memory");
        assert_eq!(entry.kind(), genos_core::DiffKind::Added);
        assert_eq!(entry.after.as_deref(), Some(FACT));
        assert!(entry
            .provenance
            .as_deref()
            .expect("no provenance")
            .contains(&stored_a.branch_id.0));

        let stream_a = event_store
            .stream(Some(stored_a.branch_id.0.clone()))
            .await
            .expect("stream a failed");
        let stream_b = event_store
            .stream(Some(stored_b.branch_id.0.clone()))
            .await
            .expect("stream b failed");
        assert_eq!(stream_a.len(), 1);
        assert!(stream_b.is_empty());
        assert_eq!(stream_a[0].event_type, AgentEventType::MemoryCreated);
        assert_eq!(stream_a[0].payload["content"], FACT);
        assert_eq!(stream_a[0].payload["created_in"], stored_a.branch_id.0);

        if fs::try_exists(&events_path)
            .await
            .expect("try_exists events failed")
        {
            fs::remove_file(events_path)
                .await
                .expect("cleanup events failed");
        }
        if fs::try_exists(&snapshots_path)
            .await
            .expect("try_exists snapshots failed")
        {
            fs::remove_file(snapshots_path)
                .await
                .expect("cleanup snapshots failed");
        }
    }

    /// Two branches write the same variable differently from one snapshot, and
    /// the divergence still holds after a store round-trip: nothing here relies
    /// on the in-memory copies staying alive.
    #[tokio::test]
    async fn diverging_branch_writes_survive_a_store_round_trip() {
        let events_path = temp_store_path();
        let snapshots_path = temp_store_path();
        let event_store = LocalEventStore::new(&events_path);
        let snapshot_store = LocalSnapshotStore::new(&snapshots_path);

        const INITIAL: &str = "0";

        let mut parent = make_snapshot(0);
        parent.set_variable("counter", INITIAL);
        snapshot_store
            .save_snapshot(parent.clone())
            .await
            .expect("save parent snapshot failed");

        let mut a1 = genos_core::fork_snapshot(&parent);
        let mut a2 = genos_core::fork_snapshot(&parent);

        let w1 = genos_core::write_variable_on_branch(&mut a1, "counter", "10");
        let w2 = genos_core::write_variable_on_branch(&mut a2, "counter", "20");

        event_store
            .append(w1.event)
            .await
            .expect("append a1 write failed");
        event_store
            .append(w2.event)
            .await
            .expect("append a2 write failed");
        snapshot_store
            .save_snapshot(a1.clone())
            .await
            .expect("save a1 snapshot failed");
        snapshot_store
            .save_snapshot(a2.clone())
            .await
            .expect("save a2 snapshot failed");

        let stored_parent = snapshot_store
            .get_snapshot(parent.snapshot_id.0.clone())
            .await
            .expect("get parent snapshot failed")
            .expect("parent snapshot missing");
        let stored_a1 = snapshot_store
            .get_snapshot(a1.snapshot_id.0.clone())
            .await
            .expect("get a1 snapshot failed")
            .expect("a1 snapshot missing");
        let stored_a2 = snapshot_store
            .get_snapshot(a2.snapshot_id.0.clone())
            .await
            .expect("get a2 snapshot failed")
            .expect("a2 snapshot missing");

        let report = genos_core::check_variable_isolation(
            "counter",
            genos_core::VariableExpectation::holds(&stored_parent, INITIAL),
            &[
                genos_core::VariableExpectation::holds(&stored_a1, "10"),
                genos_core::VariableExpectation::holds(&stored_a2, "20"),
            ],
        );
        assert!(report.isolated, "{report:?}");
        assert!(report.violations.is_empty());

        // Each write is the first event of its own branch, and replaying one
        // branch never surfaces the other's value.
        let stream_a1 = event_store
            .stream(Some(stored_a1.branch_id.0.clone()))
            .await
            .expect("stream a1 failed");
        let stream_a2 = event_store
            .stream(Some(stored_a2.branch_id.0.clone()))
            .await
            .expect("stream a2 failed");

        assert_eq!(stream_a1.len(), 1);
        assert_eq!(stream_a2.len(), 1);
        assert_eq!(stream_a1[0].payload["value"], "10");
        assert_eq!(stream_a2[0].payload["value"], "20");
        assert_eq!(stream_a1[0].payload["previous_value"], INITIAL);
        assert_eq!(stream_a1[0].agent_id, stored_a1.agent_id);
        assert_eq!(stream_a2[0].agent_id, stored_a2.agent_id);

        let replay_a1 =
            replay_basic_state_from(basic_state_from_snapshot(&stored_parent), &stream_a1);
        let replay_a2 =
            replay_basic_state_from(basic_state_from_snapshot(&stored_parent), &stream_a2);
        assert_eq!(replay_a1.branch_id.as_ref(), Some(&stored_a1.branch_id));
        assert_eq!(replay_a2.branch_id.as_ref(), Some(&stored_a2.branch_id));
        assert_eq!(replay_a1.last_sequence, 1);
        assert_eq!(replay_a2.last_sequence, 1);

        // The parent branch itself recorded nothing.
        let stream_parent = event_store
            .stream(Some(stored_parent.branch_id.0.clone()))
            .await
            .expect("stream parent failed");
        assert!(stream_parent.is_empty());

        if fs::try_exists(&events_path)
            .await
            .expect("try_exists events failed")
        {
            fs::remove_file(events_path)
                .await
                .expect("cleanup events failed");
        }
        if fs::try_exists(&snapshots_path)
            .await
            .expect("try_exists snapshots failed")
        {
            fs::remove_file(snapshots_path)
                .await
                .expect("cleanup snapshots failed");
        }
    }

    #[tokio::test]
    async fn capsule_store_round_trips_verified_checkpoints() {
        let path = temp_store_path();
        let store = LocalCapsuleStore::new(&path);
        let snapshot = make_snapshot(0);
        let capsule = genos_core::AgentWorldCapsule::new(
            snapshot.clone(),
            genos_core::SnapshotId::new(),
            Some(snapshot.world_id.clone()),
            vec![],
            None,
            genos_core::CapsuleRelation::Genesis,
        );
        store.save_capsule(capsule.clone()).await.unwrap();
        let loaded = store
            .get_capsule(capsule.capsule_id.0.clone())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(loaded, capsule);
        assert!(loaded.verify_integrity());
        assert_eq!(
            store
                .list_branch_capsules(snapshot.branch_id.0)
                .await
                .unwrap()
                .len(),
            1
        );
        if fs::try_exists(&path).await.unwrap() {
            fs::remove_file(path).await.unwrap();
        }
    }
}
