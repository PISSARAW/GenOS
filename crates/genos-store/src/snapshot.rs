use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SnapshotManifest {
    pub schema: String,
    pub version: String,
    pub agent_id: String,
    pub branch_id: String,
    pub timestamp: String,
    pub payload: serde_json::Value,
}

impl SnapshotManifest {
    pub fn new(agent_id: &str, branch_id: &str, payload: serde_json::Value) -> Self {
        Self {
            schema: "snapshot.schema.json".to_string(),
            version: "3.0.0".to_string(),
            agent_id: agent_id.to_string(),
            branch_id: branch_id.to_string(),
            timestamp: Utc::now().to_rfc3339(),
            payload,
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
