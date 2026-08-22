use anyhow::{bail, Context, Result};
use genos_model::{factory::ModelFactory, GenerationConfig, Message, Role};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    future::Future,
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
    pin::Pin,
    time::Duration,
};
use uuid::Uuid;

use crate::args::{WorkflowInitArgs, WorkflowManifestArgs, WorkflowResumeArgs, WorkflowRunArgs};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowManifest {
    pub version: u32,
    pub name: String,
    pub entry: String,
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub agents: BTreeMap<String, AgentSpec>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSpec {
    pub role: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub policy: Policy,
}
fn default_model() -> String {
    "fake://local".into()
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Policy {
    #[serde(default)]
    pub approval_required: bool,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    #[serde(flatten)]
    pub kind: NodeKind,
    #[serde(default)]
    pub next: Option<String>,
    #[serde(default)]
    pub when: Option<String>,
    #[serde(default)]
    pub retry: RetryPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    #[serde(default = "default_attempts")]
    pub attempts: u32,
    #[serde(default)]
    pub backoff_ms: u64,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            attempts: default_attempts(),
            backoff_ms: 0,
            timeout_ms: None,
        }
    }
}

fn default_attempts() -> u32 {
    1
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NodeKind {
    Agent {
        agent: String,
        prompt: String,
    },
    Handoff {
        to: String,
        contract: String,
    },
    Approval {
        message: String,
    },
    Parallel {
        branches: Vec<Vec<String>>,
    },
    Loop {
        body: Vec<String>,
        max_iterations: u32,
        #[serde(default)]
        while_expr: Option<String>,
    },
    Subgraph {
        nodes: Vec<Node>,
    },
    End,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunState {
    pub id: String,
    pub manifest: WorkflowManifest,
    pub current: String,
    pub input: Value,
    pub outputs: BTreeMap<String, Value>,
    pub pending: Option<PendingApproval>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingApproval {
    pub node: String,
    pub message: String,
}
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    RunStarted {
        run_id: String,
        workflow: String,
    },
    NodeStarted {
        node: String,
    },
    Token {
        node: String,
        token: String,
    },
    Handoff {
        from: String,
        to: String,
        contract: String,
    },
    ApprovalRequired {
        run: String,
        node: String,
        message: String,
        state_file: String,
    },
    NodeFinished {
        node: String,
    },
    RunFinished {
        run_id: String,
        output: Value,
    },
}

fn emit(event: Event) -> Result<()> {
    let mut out = io::stdout().lock();
    serde_json::to_writer(&mut out, &event)?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

pub fn cmd_workflow_init(args: WorkflowInitArgs) -> Result<()> {
    let manifest = "version: 1\nname: example\nentry: ask\nagents:\n  assistant:\n    role: generalist\n    model: fake://local\nnodes:\n  - id: ask\n    kind: agent\n    agent: assistant\n    prompt: \"Answer: {{input}}\"\n    next: approve\n  - id: approve\n    kind: approval\n    message: \"Publish this answer?\"\n    next: done\n  - id: done\n    kind: end\n";
    std::fs::write(&args.output, manifest)
        .with_context(|| format!("writing {}", args.output.display()))?;
    println!("created {}", args.output.display());
    Ok(())
}
fn read_manifest(path: &Path) -> Result<WorkflowManifest> {
    let bytes = std::fs::read(path).with_context(|| format!("reading {}", path.display()))?;
    Ok(match path.extension().and_then(|x| x.to_str()) {
        Some("json") => serde_json::from_slice(&bytes)?,
        _ => serde_yaml::from_slice(&bytes)?,
    })
}
fn validate(manifest: &WorkflowManifest) -> Result<()> {
    if manifest.version != 1 {
        bail!("unsupported workflow manifest version {}", manifest.version);
    }
    if manifest.nodes.is_empty() {
        bail!("workflow must contain at least one node");
    }
    let ids: std::collections::HashSet<_> = manifest.nodes.iter().map(|n| n.id.as_str()).collect();
    if !ids.contains(manifest.entry.as_str()) {
        bail!("entry node {:?} does not exist", manifest.entry);
    }
    for node in &manifest.nodes {
        if let Some(next) = &node.next {
            if !ids.contains(next.as_str()) {
                bail!("node {} points to missing node {}", node.id, next);
            }
        }
        if let NodeKind::Agent { agent, .. } = &node.kind {
            if !manifest.agents.contains_key(agent) {
                bail!("node {} references missing agent {}", node.id, agent);
            }
        }
        if node.retry.attempts == 0 {
            bail!("node {} must allow at least one attempt", node.id);
        }
    }
    let mut visiting = std::collections::HashSet::new();
    let mut visited = std::collections::HashSet::new();
    fn visit(
        id: &str,
        nodes: &[Node],
        visiting: &mut std::collections::HashSet<String>,
        visited: &mut std::collections::HashSet<String>,
    ) -> Result<()> {
        if visiting.contains(id) {
            bail!("workflow contains a cycle at node {}", id);
        }
        if !visited.insert(id.to_string()) {
            return Ok(());
        }
        visiting.insert(id.to_string());
        if let Some(node) = nodes.iter().find(|node| node.id == id) {
            if let Some(next) = &node.next {
                visit(next, nodes, visiting, visited)?;
            }
            match &node.kind {
                NodeKind::Parallel { branches } => {
                    for branch in branches {
                        for child in branch {
                            visit(child, nodes, visiting, visited)?;
                        }
                    }
                }
                NodeKind::Loop { body, .. } => {
                    for child in body {
                        visit(child, nodes, visiting, visited)?;
                    }
                }
                _ => {}
            }
        }
        visiting.remove(id);
        Ok(())
    }
    visit(
        &manifest.entry,
        &manifest.nodes,
        &mut visiting,
        &mut visited,
    )?;
    Ok(())
}
pub fn cmd_workflow_validate(args: WorkflowManifestArgs) -> Result<()> {
    let manifest = read_manifest(&args.manifest)?;
    validate(&manifest)?;
    println!(
        "valid workflow {} ({} nodes, {} agents)",
        manifest.name,
        manifest.nodes.len(),
        manifest.agents.len()
    );
    Ok(())
}
fn input_value(raw: Option<String>) -> Result<Value> {
    match raw {
        Some(raw) => Ok(serde_json::from_str(&raw).unwrap_or(Value::String(raw))),
        None => {
            let mut s = String::new();
            io::stdin().lock().read_line(&mut s)?;
            Ok(serde_json::from_str(s.trim()).unwrap_or(Value::String(s.trim().into())))
        }
    }
}
fn render(template: &str, input: &Value, outputs: &BTreeMap<String, Value>) -> String {
    let mut result = template.replace("{{input}}", &input.to_string());
    for (id, value) in outputs {
        result = result.replace(&format!("{{{{nodes.{id}}}}}"), &value.to_string());
    }
    result
}
fn condition(expr: Option<&str>, input: &Value, outputs: &BTreeMap<String, Value>) -> bool {
    let Some(expr) = expr else { return true };
    if expr == "always" {
        return true;
    }
    if expr == "never" {
        return false;
    }
    let rendered = render(expr, input, outputs);
    if let Some((left, right)) = rendered.split_once("==") {
        return left.trim().trim_matches('"') == right.trim().trim_matches('"');
    }
    rendered != "false" && rendered != "0" && !rendered.is_empty()
}

fn execute_node<'a>(
    state: &'a mut RunState,
    node: &'a Node,
    auto_approve: bool,
) -> Pin<Box<dyn Future<Output = Result<bool>> + 'a>> {
    Box::pin(async move {
        if !condition(node.when.as_deref(), &state.input, &state.outputs) {
            return Ok(true);
        }
        emit(Event::NodeStarted {
            node: node.id.clone(),
        })?;
        match &node.kind {
            NodeKind::Agent { agent, prompt } => {
                let spec = state
                    .manifest
                    .agents
                    .get(agent)
                    .context("agent disappeared during run")?;
                let prompt = render(prompt, &state.input, &state.outputs);
                let config = GenerationConfig {
                    max_tokens: spec.policy.max_tokens,
                    ..Default::default()
                };
                let messages = [Message {
                    role: Role::User,
                    content: prompt,
                    tool_call_id: None,
                }];
                let mut last_error = None;
                let mut response = None;
                for attempt in 0..node.retry.attempts {
                    let provider = ModelFactory::create(&spec.model, None)?;
                    let request = provider.generate(&messages, &config);
                    let result = match node.retry.timeout_ms {
                        Some(timeout_ms) => {
                            tokio::time::timeout(Duration::from_millis(timeout_ms), request)
                                .await
                                .map_err(|_| {
                                    anyhow::anyhow!(
                                        "node {} timed out after {} ms",
                                        node.id,
                                        timeout_ms
                                    )
                                })?
                        }
                        None => request.await,
                    };
                    match result {
                        Ok(value) => {
                            response = Some(value);
                            break;
                        }
                        Err(error) => {
                            last_error = Some(error);
                            if attempt + 1 < node.retry.attempts && node.retry.backoff_ms > 0 {
                                tokio::time::sleep(Duration::from_millis(
                                    node.retry.backoff_ms * (attempt as u64 + 1),
                                ))
                                .await;
                            }
                        }
                    }
                }
                let response = response.ok_or_else(|| {
                    last_error.unwrap_or_else(|| anyhow::anyhow!("node {} failed", node.id))
                })?;
                let text = response.content.unwrap_or_default();
                for token in text.split_whitespace() {
                    emit(Event::Token {
                        node: node.id.clone(),
                        token: format!("{token} "),
                    })?;
                }
                state.outputs.insert(node.id.clone(), Value::String(text));
            }
            NodeKind::Handoff { to, contract } => emit(Event::Handoff {
                from: node.id.clone(),
                to: to.clone(),
                contract: contract.clone(),
            })?,
            NodeKind::Approval { message } if !auto_approve => {
                state.pending = Some(PendingApproval {
                    node: node.id.clone(),
                    message: message.clone(),
                });
                let path = save_state(state)?;
                emit(Event::ApprovalRequired {
                    run: state.id.clone(),
                    node: node.id.clone(),
                    message: message.clone(),
                    state_file: path.display().to_string(),
                })?;
                return Ok(false);
            }
            NodeKind::Approval { .. } => {}
            NodeKind::Parallel { branches } => {
                for branch in branches {
                    for id in branch {
                        let child = state
                            .manifest
                            .nodes
                            .iter()
                            .find(|n| n.id == *id)
                            .cloned()
                            .context("parallel node missing")?;
                        if !execute_node(state, &child, true).await? {
                            bail!("parallel branch paused")
                        }
                    }
                }
            }
            NodeKind::Loop {
                body,
                max_iterations,
                while_expr,
            } => {
                for _ in 0..*max_iterations {
                    if !condition(while_expr.as_deref(), &state.input, &state.outputs) {
                        break;
                    }
                    for id in body {
                        let child = state
                            .manifest
                            .nodes
                            .iter()
                            .find(|n| n.id == *id)
                            .cloned()
                            .context("loop node missing")?;
                        if !execute_node(state, &child, auto_approve).await? {
                            return Ok(false);
                        }
                    }
                }
            }
            NodeKind::Subgraph { nodes } => {
                for child in nodes {
                    if !execute_node(state, child, auto_approve).await? {
                        return Ok(false);
                    }
                }
            }
            NodeKind::End => {}
        }
        emit(Event::NodeFinished {
            node: node.id.clone(),
        })?;
        Ok(true)
    })
}
fn save_state(state: &RunState) -> Result<PathBuf> {
    let dir = PathBuf::from(".genos/runs");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.json", state.id));
    std::fs::write(&path, serde_json::to_vec_pretty(state)?)?;
    Ok(path)
}
async fn run(mut state: RunState, auto_approve: bool) -> Result<()> {
    emit(Event::RunStarted {
        run_id: state.id.clone(),
        workflow: state.manifest.name.clone(),
    })?;
    loop {
        let node = state
            .manifest
            .nodes
            .iter()
            .find(|n| n.id == state.current)
            .cloned()
            .context("current node missing")?;
        if !execute_node(&mut state, &node, auto_approve).await? {
            return Ok(());
        }
        match &node.kind {
            NodeKind::End => break,
            _ => match &node.next {
                Some(next) => state.current = next.clone(),
                None => break,
            },
        }
    }
    emit(Event::RunFinished {
        run_id: state.id,
        output: json!({"input": state.input, "nodes": state.outputs}),
    })?;
    Ok(())
}
pub async fn cmd_workflow_run(args: WorkflowRunArgs) -> Result<()> {
    let manifest = read_manifest(&args.manifest)?;
    validate(&manifest)?;
    let state = RunState {
        id: Uuid::new_v4().to_string(),
        current: manifest.entry.clone(),
        manifest,
        input: input_value(args.input)?,
        outputs: BTreeMap::new(),
        pending: None,
    };
    run(state, args.auto_approve).await
}
pub async fn cmd_workflow_resume(args: WorkflowResumeArgs) -> Result<()> {
    let mut state: RunState = serde_json::from_slice(&std::fs::read(&args.run)?)?;
    let pending = state
        .pending
        .take()
        .context("run is not waiting for approval")?;
    let pending_node = pending.node.clone();
    match args.decision.as_str() {
        "approve" | "approved" => {}
        "reject" | "rejected" => {
            state
                .outputs
                .insert(pending_node.clone(), Value::String("rejected".into()));
            return run(state, true).await;
        }
        replacement => {
            state.outputs.insert(
                pending_node.clone(),
                serde_json::from_str(replacement).unwrap_or(Value::String(replacement.into())),
            );
        }
    }
    state.current = state
        .manifest
        .nodes
        .iter()
        .find(|n| n.id == pending_node)
        .and_then(|n| n.next.clone())
        .context("approval node has no next")?;
    run(state, true).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_missing_agent() {
        let m = WorkflowManifest {
            version: 1,
            name: "x".into(),
            entry: "a".into(),
            nodes: vec![Node {
                id: "a".into(),
                kind: NodeKind::Agent {
                    agent: "missing".into(),
                    prompt: "x".into(),
                },
                next: None,
                when: None,
                retry: RetryPolicy::default(),
            }],
            agents: BTreeMap::new(),
        };
        assert!(validate(&m).is_err());
    }
}
