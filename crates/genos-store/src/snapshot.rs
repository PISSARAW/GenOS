use async_trait::async_trait;
use genos_core::ids::SnapshotId;
use genos_core::AgentSnapshot;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use genos_core::snapshot::SnapshotComponentManifest;

/// Store de haut niveau pour les instantanés d'agents.
///
/// Ce store orchestre le fonctionnement de l'architecture de mémoire $O(1)$ :
/// il découpe l'état de l'agent, sauvegarde chaque composant dans un `CasStore`
/// (évitant la duplication) et produit un `SnapshotComponentManifest`.
#[async_trait]
pub trait SnapshotStore: Send + Sync {
    async fn load_snapshot(&self, id: &SnapshotId) -> anyhow::Result<Option<AgentSnapshot>>;
    async fn save_snapshot(&self, snapshot: &AgentSnapshot) -> anyhow::Result<()>;
}

pub struct LocalSnapshotStore {
    manifest_path: PathBuf,
    write_lock: Mutex<()>,
}

impl LocalSnapshotStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        Self {
            manifest_path: file_path.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let file_path = root
            .as_ref()
            .join("snapshots")
            .join("agent-snapshots-manifests.jsonl");
        Self::new(file_path)
    }

    pub fn manifest_path(&self) -> &Path {
        &self.manifest_path
    }

    pub async fn list_snapshot_ids(&self) -> anyhow::Result<Vec<String>> {
        if !fs::try_exists(&self.manifest_path).await? {
            return Ok(Vec::new());
        }

        let raw = fs::read_to_string(&self.manifest_path).await?;
        let mut ids = Vec::new();
        let mut seen = HashSet::new();

        for (idx, line) in raw.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let manifest: SnapshotComponentManifest = serde_json::from_str(line)
                .map_err(|e| anyhow::anyhow!("invalid manifest at line {}: {e}", idx + 1))?;
            
            if seen.insert(manifest.snapshot_id.0.clone()) {
                ids.push(manifest.snapshot_id.0);
            }
        }
        Ok(ids)
    }
}

// Note: Une implémentation complète nécessiterait l'injection du CasStore 
// pour décomposer / recomposer l'AgentSnapshot lors de save/load.
// Pour l'instant, on fournit des stubs conformes au trait.

#[async_trait]
impl SnapshotStore for LocalSnapshotStore {
    async fn load_snapshot(&self, _id: &SnapshotId) -> anyhow::Result<Option<AgentSnapshot>> {
        // Logique de chargement CoW à intégrer via CasStore
        Ok(None)
    }

    async fn save_snapshot(&self, snapshot: &AgentSnapshot) -> anyhow::Result<()> {
        let _guard = self.write_lock.lock().await;

        if let Some(parent) = self.manifest_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Création simplifiée d'un manifeste pour l'exemple (sans CAS réel ici)
        let manifest = SnapshotComponentManifest {
            snapshot_id: snapshot.snapshot_id.clone(),
            agent_id: snapshot.agent_id.clone(),
            branch_id: snapshot.branch_id.clone(),
            genome_hash: genos_core::snapshot::CasHash("dummy_hash".to_string()),
            state_hash: genos_core::snapshot::CasHash("dummy_hash".to_string()),
            ssm_state_hash: None,
        };

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.manifest_path)
            .await?;

        let mut line = serde_json::to_vec(&manifest)?;
        line.push(b'\n');
        file.write_all(&line).await?;
        file.flush().await?;
        
        Ok(())
    }
}
