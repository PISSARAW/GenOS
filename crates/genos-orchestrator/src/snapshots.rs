//! Coffre de snapshots persistant (ouvert à la demande pour éviter tout
//! effet de bord disque dans `GenosEcosystem::new`).

use genos_store::{SnapshotManifest, SnapshotStore};
use serde_json::Value;
use std::path::PathBuf;
use uuid::Uuid;

/// Coffre de snapshots signés, ouvert explicitement par l'appelant.
#[derive(Default)]
pub struct SnapshotVault {
    store: Option<SnapshotStore>,
}

impl SnapshotVault {
    pub fn new() -> Self {
        Self { store: None }
    }

    /// Ouvre (et crée si besoin) le répertoire de snapshots.
    pub fn open(&mut self, dir: impl Into<PathBuf>) -> Result<(), String> {
        let store = SnapshotStore::try_with_dir(dir).map_err(|error| error.to_string())?;
        self.store = Some(store);
        Ok(())
    }

    pub fn is_open(&self) -> bool {
        self.store.is_some()
    }

    pub fn save(&mut self, agent_id: &str, branch_id: &str, payload: Value) -> Result<Uuid, String> {
        let store = self
            .store
            .as_mut()
            .ok_or_else(|| "coffre de snapshots non ouvert".to_string())?;
        store.save(SnapshotManifest::new(agent_id, branch_id, payload))
    }

    pub fn get(&self, id: &Uuid) -> Option<&SnapshotManifest> {
        self.store.as_ref()?.get(id)
    }

    pub fn list_by_agent(&self, agent_id: &str) -> Vec<(Uuid, &SnapshotManifest)> {
        match &self.store {
            Some(store) => store.list_by_agent(agent_id),
            None => Vec::new(),
        }
    }
}
