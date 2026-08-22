use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    sync::Arc,
};
use tokio::sync::{broadcast, watch, Mutex, Semaphore};

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
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct WorkflowState {
    pub workflow_version: u32,
    #[serde(default)]
    pub input: Value,
    pub current: Vec<String>,
    pub outputs: BTreeMap<String, Value>,
    pub completed: HashSet<String>,
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
        let (events, _) = broadcast::channel(256);
        let (cancel_tx, cancel) = watch::channel(false);
        Ok(Self {
            workflow,
            operation,
            store,
            events,
            cancel,
            cancel_tx,
            concurrency: Arc::new(Semaphore::new(concurrency.max(1))),
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
        while let Some(id) = queue.pop() {
            if *self.cancel.borrow() {
                let _ = self.events.send(WorkflowEvent::Cancelled);
                state.current = queue;
                self.store.save(&state).await?;
                return Ok(state);
            }
            let node = self
                .workflow
                .nodes
                .iter()
                .find(|n| n.id == id)
                .cloned()
                .context("workflow node missing")?;
            if state.completed.contains(&id) {
                let _ = self.events.send(WorkflowEvent::Skipped { node: id });
                continue;
            }
            let _ = self
                .events
                .send(WorkflowEvent::Started { node: id.clone() });
            let permits = node.max_concurrency.unwrap_or(1).max(1);
            let _global = self
                .concurrency
                .acquire_many(permits.min(self.concurrency.available_permits().max(1)) as u32)
                .await?;
            match self.operation.run(&node, &state.outputs).await {
                Ok(output) => {
                    state.outputs.insert(id.clone(), output.clone());
                    state.completed.insert(id.clone());
                    for next in node.next.iter().rev() {
                        queue.push(next.clone());
                    }
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
            state.current = queue.clone();
            self.store.save(&state).await?;
        }
        Ok(state)
    }
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
                },
                WorkflowNode {
                    id: "b".into(),
                    next: vec![],
                    max_concurrency: None,
                    operation: "two".into(),
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
}
