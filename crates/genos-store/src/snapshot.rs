use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SnapshotManifest {
    #[serde(default = "default_schema")]
    pub schema: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub world_id: String,
    pub created_at: String,
    pub genome: serde_json::Value,
    pub state: serde_json::Value,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default)]
    pub payload: Option<serde_json::Value>,
}

fn default_schema() -> String {
    "snapshot.schema.json".to_string()
}

fn default_version() -> String {
    "3.0.0".to_string()
}

impl SnapshotManifest {
    pub fn new(agent_id: &str, branch_id: &str, payload: serde_json::Value) -> Self {
        let now = Utc::now().to_rfc3339();
        let snap_id = payload.get("snapshot_id")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| "snap-default")
            .to_string();
        let world_id = payload.get("world_id")
            .and_then(|v| v.as_str())
            .unwrap_or("world-matrix-0")
            .to_string();
        let genome = payload.get("genome").cloned().unwrap_or_else(|| serde_json::json!({}));
        let state = payload.get("state").cloned().unwrap_or_else(|| serde_json::json!({
            "execution_status": "quiescent",
            "working_memory": [],
            "entropy": 0.42,
            "dissonance": 0.0
        }));

        Self {
            schema: default_schema(),
            version: default_version(),
            snapshot_id: snap_id,
            agent_id: agent_id.to_string(),
            branch_id: branch_id.to_string(),
            world_id,
            created_at: now.clone(),
            genome,
            state,
            timestamp: Some(now),
            payload: Some(payload),
        }
    }
}

#[derive(Default)]
pub struct SnapshotStore {
    snapshots: HashMap<Uuid, SnapshotManifest>,
}

impl SnapshotStore {
    pub fn new() -> Self {
        Self {
            snapshots: HashMap::new(),
        }
    }

    pub fn save(&mut self, manifest: SnapshotManifest) -> Uuid {
        let id = Uuid::new_v4();
        self.snapshots.insert(id, manifest);
        id
    }

    pub fn get(&self, id: &Uuid) -> Option<&SnapshotManifest> {
        self.snapshots.get(id)
    }

    pub fn list_by_agent(&self, agent_id: &str) -> Vec<(Uuid, &SnapshotManifest)> {
        self.snapshots
            .iter()
            .filter(|(_, s)| s.agent_id == agent_id)
            .map(|(&id, s)| (id, s))
            .collect()
    }
}
