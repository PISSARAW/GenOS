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
    #[serde(default = "default_storage_id")]
    storage_id: Uuid,
}

fn default_schema() -> String {
    "snapshot.schema.json".to_string()
}

fn default_version() -> String {
    "3.0.0".to_string()
}

fn default_storage_id() -> Uuid {
    Uuid::new_v4()
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
            storage_id: default_storage_id(),
        }
    }
}

pub struct SnapshotStore {
    snapshots: HashMap<Uuid, SnapshotManifest>,
    store_dir: std::path::PathBuf,
}

impl SnapshotStore {
    pub fn new() -> Self {
        Self::with_dir(".genos/snapshots")
    }

    pub fn with_dir(store_dir: impl Into<std::path::PathBuf>) -> Self {
        Self::try_with_dir(store_dir).expect("failed to initialize snapshot store directory")
    }

    pub fn try_with_dir(store_dir: impl Into<std::path::PathBuf>) -> std::io::Result<Self> {
        let store_dir = store_dir.into();
        std::fs::create_dir_all(&store_dir)?;
        
        let mut snapshots = HashMap::new();
        if let Ok(entries) = std::fs::read_dir(&store_dir) {
            for entry in entries.flatten() {
                if let Ok(content) = std::fs::read_to_string(entry.path()) {
                    if let Ok(manifest) = serde_json::from_str::<SnapshotManifest>(&content) {
                        snapshots.insert(manifest.storage_id, manifest);
                    }
                }
            }
        }
        
        Ok(Self {
            snapshots,
            store_dir,
        })
    }

    pub fn save(&mut self, mut manifest: SnapshotManifest) -> Result<Uuid, String> {
        let id = if manifest.storage_id == Uuid::nil() {
            default_storage_id()
        } else {
            manifest.storage_id
        };
        manifest.storage_id = id;
        if manifest.snapshot_id == "snap-default" || manifest.snapshot_id.is_empty() {
            manifest.snapshot_id = format!("snap-{}", id.simple());
        }
        
        let file_path = self.store_dir.join(format!("{}.json", manifest.snapshot_id));
        let json = serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
        std::fs::write(file_path, json).map_err(|error| error.to_string())?;
        
        self.snapshots.insert(id, manifest);
        Ok(id)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_snapshot_keeps_storage_id_after_reload() {
        let root = std::env::temp_dir().join(format!("genos-store-{}", Uuid::new_v4()));
        let mut store = SnapshotStore::with_dir(&root);
        let manifest = SnapshotManifest::new("agent-1", "branch-1", serde_json::json!({}));
        let id = store.save(manifest).unwrap();
        assert!(store.get(&id).is_some());

        let reloaded = SnapshotStore::with_dir(&root);
        assert!(reloaded.get(&id).is_some());

        std::fs::remove_dir_all(root).unwrap();
    }
}
