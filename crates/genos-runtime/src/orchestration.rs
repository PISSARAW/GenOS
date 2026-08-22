use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::{
    fs,
    io::AsyncWriteExt,
    sync::{broadcast, watch, Mutex, Semaphore},
    time::{timeout, Duration},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Workflow {
    pub version: u32,
    pub entry: String,
    pub nodes: Vec<WorkflowNode>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub next: Vec<String>,
    #[serde(default)]
    pub max_concurrency: Option<usize>,
    pub operation: String,
    #[serde(default)]
    pub max_retries: u32,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub idempotency_key: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct WorkflowState {
    pub workflow_version: u32,
    #[serde(default)]
    pub input: Value,
    pub current: Vec<String>,
    pub outputs: BTreeMap<String, Value>,
    pub completed: HashSet<String>,
    #[serde(default)]
    pub completed_keys: HashSet<String>,
    pub failed: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum WorkflowEvent {
    Started { node: String },
    Completed { node: String, output: Value },
    Skipped { node: String },
    Failed { node: String, error: String },
    Cancelled,
}

#[async_trait]
pub trait WorkflowOperation: Send + Sync {
    async fn run(&self, node: &WorkflowNode, inputs: &BTreeMap<String, Value>) -> Result<Value>;
}
#[async_trait]
pub trait WorkflowStateStore: Send + Sync {
    async fn load(&self) -> Result<Option<WorkflowState>>;
    async fn save(&self, state: &WorkflowState) -> Result<()>;
}

pub struct MemoryWorkflowStateStore {
    state: Mutex<Option<WorkflowState>>,
}
impl MemoryWorkflowStateStore {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(None),
        }
    }
}
#[async_trait]
impl WorkflowStateStore for MemoryWorkflowStateStore {
    async fn load(&self) -> Result<Option<WorkflowState>> {
        Ok(self.state.lock().await.clone())
    }
    async fn save(&self, state: &WorkflowState) -> Result<()> {
        *self.state.lock().await = Some(state.clone());
        Ok(())
    }
}

/// Durable local state store. Writes use a sibling temporary file followed by
/// rename so a process crash cannot leave a partially serialized state file.
pub struct FileWorkflowStateStore {
    path: PathBuf,
    write_lock: Mutex<()>,
}

impl FileWorkflowStateStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[async_trait]
impl WorkflowStateStore for FileWorkflowStateStore {
    async fn load(&self) -> Result<Option<WorkflowState>> {
        if !fs::try_exists(&self.path).await? {
            return Ok(None);
        }
        Ok(Some(serde_json::from_slice(&fs::read(&self.path).await?)?))
    }

    async fn save(&self, state: &WorkflowState) -> Result<()> {
        let _guard = self.write_lock.lock().await;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let temporary = self.path.with_extension("json.tmp");
        let mut file = fs::File::create(&temporary).await?;
        file.write_all(&serde_json::to_vec_pretty(state)?).await?;
        file.flush().await?;
        drop(file);
        fs::rename(temporary, &self.path).await?;
        Ok(())
    }
}

pub struct WorkflowEngine {
    workflow: Workflow,
    operation: Arc<dyn WorkflowOperation>,
    store: Arc<dyn WorkflowStateStore>,
    events: broadcast::Sender<WorkflowEvent>,
    cancel: watch::Receiver<bool>,
    cancel_tx: watch::Sender<bool>,
    concurrency: Arc<Semaphore>,
}
impl WorkflowEngine {
    pub fn new(
        workflow: Workflow,
        operation: Arc<dyn WorkflowOperation>,
        store: Arc<dyn WorkflowStateStore>,
        concurrency: usize,
    ) -> Result<Self> {
        validate_workflow(&workflow)?;
        let concurrency = concurrency.max(1);
        if workflow
            .nodes
            .iter()
            .any(|node| node.max_concurrency.unwrap_or(1) > concurrency)
        {
            bail!("node concurrency cannot exceed engine concurrency");
        }
        let (events, _) = broadcast::channel(256);
        let (cancel_tx, cancel) = watch::channel(false);
        Ok(Self {
            workflow,
            operation,
            store,
            events,
            cancel,
            cancel_tx,
            concurrency: Arc::new(Semaphore::new(concurrency)),
        })
    }
    pub fn subscribe(&self) -> broadcast::Receiver<WorkflowEvent> {
        self.events.subscribe()
    }
    pub fn cancel_handle(&self) -> watch::Sender<bool> {
        self.cancel_tx.clone()
    }
    pub async fn run(&self, input: Value) -> Result<WorkflowState> {
        let mut state = self.store.load().await?.unwrap_or_else(|| WorkflowState {
            workflow_version: self.workflow.version,
            input: input.clone(),
            current: vec![self.workflow.entry.clone()],
            ..Default::default()
        });
        if state.workflow_version != self.workflow.version {
            bail!(
                "workflow state version {} cannot run workflow version {}",
                state.workflow_version,
                self.workflow.version
            );
        }
        if state.input.is_null() {
            state.input = input;
        }
        let mut queue = std::mem::take(&mut state.current);
        if queue.is_empty() && state.completed.is_empty() {
            queue.push(self.workflow.entry.clone());
        }
        while !queue.is_empty() {
            if *self.cancel.borrow() {
                let _ = self.events.send(WorkflowEvent::Cancelled);
                state.current = queue;
                self.store.save(&state).await?;
                return Ok(state);
            }
            let ready = std::mem::take(&mut queue);
            let mut tasks = tokio::task::JoinSet::new();
            for id in ready {
                let node = self
                    .workflow
                    .nodes
                    .iter()
                    .find(|n| n.id == id)
                    .cloned()
                    .context("workflow node missing")?;
                let key = node
                    .idempotency_key
                    .clone()
                    .unwrap_or_else(|| node.id.clone());
                if state.completed.contains(&id) || state.completed_keys.contains(&key) {
                    let _ = self.events.send(WorkflowEvent::Skipped { node: id });
                    continue;
                }
                let _ = self
                    .events
                    .send(WorkflowEvent::Started { node: id.clone() });
                let operation = Arc::clone(&self.operation);
                let semaphore = Arc::clone(&self.concurrency);
                let outputs = state.outputs.clone();
                let cancel = self.cancel.clone();
                let node_for_run = node.clone();
                tasks.spawn(async move {
                    (
                        id,
                        key,
                        node,
                        run_node(operation, semaphore, cancel, outputs, node_for_run).await,
                    )
                });
            }
            while let Some(result) = tasks.join_next().await {
                let (id, key, node, output) = result?;
                match output {
                    Ok(output) => {
                        state.outputs.insert(id.clone(), output.clone());
                        state.completed.insert(id.clone());
                        state.completed_keys.insert(key);
                        queue.extend(node.next.iter().cloned());
                        let _ = self
                            .events
                            .send(WorkflowEvent::Completed { node: id, output });
                    }
                    Err(error) => {
                        let message = error.to_string();
                        state.failed = Some(message.clone());
                        let _ = self.events.send(WorkflowEvent::Failed {
                            node: id,
                            error: message,
                        });
                        state.current = queue;
                        self.store.save(&state).await?;
                        return Ok(state);
                    }
                }
            }
            state.current = queue.clone();
            self.store.save(&state).await?;
        }
        Ok(state)
    }
}

async fn run_node(
    operation: Arc<dyn WorkflowOperation>,
    semaphore: Arc<Semaphore>,
    mut cancel: watch::Receiver<bool>,
    outputs: BTreeMap<String, Value>,
    node: WorkflowNode,
) -> Result<Value> {
    let permits = node.max_concurrency.unwrap_or(1).max(1) as u32;
    let mut last_error = None;
    for _attempt in 0..=node.max_retries {
        let permit = semaphore.clone().acquire_many_owned(permits).await?;
        let operation = Arc::clone(&operation);
        let node_for_run = node.clone();
        let run = async {
            tokio::select! {
                result = operation.run(&node_for_run, &outputs) => result,
                changed = cancel.changed() => {
                    if changed.is_ok() && *cancel.borrow() { bail!("workflow cancelled") }
                    bail!("workflow cancellation channel closed")
                }
            }
        };
        let result = if let Some(timeout_ms) = node.timeout_ms {
            timeout(Duration::from_millis(timeout_ms), run)
                .await
                .map_err(|_| anyhow::anyhow!("node {} timed out after {}ms", node.id, timeout_ms))?
        } else {
            run.await
        };
        drop(permit);
        match result {
            Ok(output) => return Ok(output),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("node {} failed", node.id)))
}

pub fn validate_workflow(workflow: &Workflow) -> Result<()> {
    if workflow.version == 0 || workflow.nodes.is_empty() {
        bail!("workflow must have a positive version and at least one node");
    }
    let ids: HashSet<_> = workflow.nodes.iter().map(|n| n.id.as_str()).collect();
    if !ids.contains(workflow.entry.as_str()) {
        bail!("entry node does not exist");
    }
    let mut seen = HashSet::new();
    for node in &workflow.nodes {
        if !seen.insert(&node.id) {
            bail!("duplicate node {}", node.id);
        }
        for next in &node.next {
            if !ids.contains(next.as_str()) {
                bail!("node {} points to missing node {}", node.id, next);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct Op;
    #[async_trait]
    impl WorkflowOperation for Op {
        async fn run(&self, node: &WorkflowNode, _: &BTreeMap<String, Value>) -> Result<Value> {
            Ok(Value::String(node.operation.clone()))
        }
    }
    #[tokio::test]
    async fn durable_run_is_idempotent() {
        let wf = Workflow {
            version: 1,
            entry: "a".into(),
            nodes: vec![
                WorkflowNode {
                    id: "a".into(),
                    next: vec!["b".into()],
                    max_concurrency: None,
                    operation: "one".into(),
                    max_retries: 0,
                    timeout_ms: None,
                    idempotency_key: None,
                },
                WorkflowNode {
                    id: "b".into(),
                    next: vec![],
                    max_concurrency: None,
                    operation: "two".into(),
                    max_retries: 0,
                    timeout_ms: None,
                    idempotency_key: None,
                },
            ],
        };
        let store = Arc::new(MemoryWorkflowStateStore::new());
        let e = WorkflowEngine::new(wf, Arc::new(Op), store.clone(), 2).unwrap();
        let s = e.run(Value::Null).await.unwrap();
        assert_eq!(s.completed.len(), 2);
        let s = e.run(Value::Null).await.unwrap();
        assert_eq!(s.completed.len(), 2);
    }

    struct Flaky {
        attempts: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl WorkflowOperation for Flaky {
        async fn run(&self, _: &WorkflowNode, _: &BTreeMap<String, Value>) -> Result<Value> {
            if self.attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                bail!("transient")
            }
            Ok(Value::Bool(true))
        }
    }

    fn node(id: &str, next: Vec<&str>) -> WorkflowNode {
        WorkflowNode {
            id: id.into(),
            next: next.into_iter().map(str::to_owned).collect(),
            max_concurrency: None,
            operation: id.into(),
            max_retries: 0,
            timeout_ms: None,
            idempotency_key: None,
        }
    }

    #[tokio::test]
    async fn retries_transient_operations() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let workflow = Workflow {
            version: 1,
            entry: "a".into(),
            nodes: vec![WorkflowNode {
                max_retries: 1,
                ..node("a", vec![])
            }],
        };
        let engine = WorkflowEngine::new(
            workflow,
            Arc::new(Flaky {
                attempts: attempts.clone(),
            }),
            Arc::new(MemoryWorkflowStateStore::new()),
            1,
        )
        .unwrap();
        assert!(engine.run(Value::Null).await.unwrap().failed.is_none());
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn file_store_round_trips_state_atomically() {
        let directory = tempfile::tempdir().unwrap();
        let store = FileWorkflowStateStore::new(directory.path().join("run.json"));
        let state = WorkflowState {
            workflow_version: 2,
            input: Value::String("input".into()),
            current: vec!["next".into()],
            ..Default::default()
        };
        store.save(&state).await.unwrap();
        assert_eq!(store.load().await.unwrap().unwrap().input, state.input);
    }
}
