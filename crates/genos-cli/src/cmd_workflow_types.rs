use anyhow::{bail, Result, Context};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

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
pub struct WorkflowPackage {
    pub format: &'static str,
    pub digest: String,
    pub manifest: WorkflowManifest,
}
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
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
pub fn read_manifest(path: &Path) -> Result<WorkflowManifest> {
    let bytes = std::fs::read(path).with_context(|| format!("reading {}", path.display()))?;
    Ok(match path.extension().and_then(|x| x.to_str()) {
        Some("json") => serde_json::from_slice(&bytes)?,
        _ => serde_yaml::from_slice(&bytes)?,
    })
}
pub fn validate(manifest: &WorkflowManifest) -> Result<()> {
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
