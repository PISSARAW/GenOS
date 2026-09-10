use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

const MAX_LOGS: usize = 100;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct GraphNode {
    pub id: u32,
    pub role: String,
    pub label: String,
    pub state: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct GraphEdge {
    pub id: u32,
    pub from: u32,
    pub to: u32,
    pub kind: String,
}

/// The requestable state of the Rhizome graph $G_t = (N_t, E_t)$ at a point in time.
#[derive(Clone, Debug, Serialize, Default)]
pub struct GraphSnapshot {
    pub step: u64,
    pub phase: String,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub evidence_score: f64,
    pub logs: Vec<String>,
}

/// Event emitted every time the runtime mutates $G_t$, streamed verbatim over the telemetry WebSocket.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type")]
pub enum GraphMutated {
    Snapshot { snapshot: GraphSnapshot },
    NodeAdded { node: GraphNode },
    NodeUpdated { node: GraphNode },
    NodeRemoved { id: u32 },
    EdgeAdded { edge: GraphEdge },
    EdgeRemoved { id: u32 },
    PhaseChanged { phase: String, step: u64 },
    EvidenceRecorded { score: f64 },
    LogAppended { message: String },
}

/// Live, requestable Rhizome graph state. Every mutation broadcasts a `GraphMutated` event so
/// that any number of telemetry consumers (WebSocket dashboard, REST export, replay tooling) can
/// observe the network's topology without polling.
pub struct RhizomeGraph {
    state: RwLock<GraphSnapshot>,
    tx: broadcast::Sender<GraphMutated>,
    next_edge_id: AtomicU64,
}

impl RhizomeGraph {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(512);
        Arc::new(Self {
            state: RwLock::new(GraphSnapshot::default()),
            tx,
            next_edge_id: AtomicU64::new(1),
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<GraphMutated> {
        self.tx.subscribe()
    }

    pub fn next_edge_id(&self) -> u32 {
        self.next_edge_id.fetch_add(1, Ordering::Relaxed) as u32
    }

    pub async fn snapshot(&self) -> GraphSnapshot {
        self.state.read().await.clone()
    }

    fn emit(&self, event: GraphMutated) {
        // No active subscribers is not an error: the graph must stay requestable via REST/export.
        let _ = self.tx.send(event);
    }

    pub async fn set_phase(&self, phase: &str, step: u64) {
        let mut state = self.state.write().await;
        state.phase = phase.to_string();
        state.step = step;
        drop(state);
        self.emit(GraphMutated::PhaseChanged {
            phase: phase.to_string(),
            step,
        });
    }

    pub async fn add_node(&self, node: GraphNode) {
        let mut state = self.state.write().await;
        state.nodes.retain(|n| n.id != node.id);
        state.nodes.push(node.clone());
        drop(state);
        self.emit(GraphMutated::NodeAdded { node });
    }

    pub async fn update_node_state(&self, id: u32, new_state: &str) {
        let mut state = self.state.write().await;
        let Some(node) = state.nodes.iter_mut().find(|n| n.id == id) else {
            return;
        };
        node.state = new_state.to_string();
        let node = node.clone();
        drop(state);
        self.emit(GraphMutated::NodeUpdated { node });
    }

    pub async fn remove_node(&self, id: u32) {
        let mut state = self.state.write().await;
        state.nodes.retain(|n| n.id != id);
        drop(state);
        self.emit(GraphMutated::NodeRemoved { id });
    }

    pub async fn add_edge(&self, edge: GraphEdge) {
        let mut state = self.state.write().await;
        state.edges.push(edge.clone());
        drop(state);
        self.emit(GraphMutated::EdgeAdded { edge });
    }

    pub async fn remove_edge_between(&self, from: u32, to: u32) {
        let mut state = self.state.write().await;
        let removed: Vec<u32> = state
            .edges
            .iter()
            .filter(|e| e.from == from && e.to == to)
            .map(|e| e.id)
            .collect();
        state.edges.retain(|e| !(e.from == from && e.to == to));
        drop(state);
        for id in removed {
            self.emit(GraphMutated::EdgeRemoved { id });
        }
    }

    pub async fn record_evidence(&self, score: f64) {
        let mut state = self.state.write().await;
        state.evidence_score = score;
        drop(state);
        self.emit(GraphMutated::EvidenceRecorded { score });
    }

    pub async fn log(&self, message: &str) {
        let mut state = self.state.write().await;
        state.logs.push(message.to_string());
        if state.logs.len() > MAX_LOGS {
            let overflow = state.logs.len() - MAX_LOGS;
            state.logs.drain(0..overflow);
        }
        drop(state);
        self.emit(GraphMutated::LogAppended {
            message: message.to_string(),
        });
    }

    pub async fn reset(&self) {
        let mut state = self.state.write().await;
        *state = GraphSnapshot::default();
    }
}
