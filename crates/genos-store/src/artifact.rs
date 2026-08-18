use genos_core::{AgentSnapshot, ArtifactRef, DigestAlgorithm};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::fs;
use tokio::sync::Mutex;

/// Content-addressed local artifact store. The SHA-256 digest is the physical
/// identity, so identical artifacts across branches share one stored blob.
pub struct LocalArtifactStore {
    root: PathBuf,
    write_lock: Mutex<()>,
}

impl LocalArtifactStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn blob_path(&self, digest: &str) -> PathBuf {
        self.root.join("sha256").join(digest)
    }

    pub async fn put(
        &self,
        bytes: &[u8],
        media_type: impl Into<String>,
    ) -> anyhow::Result<ArtifactRef> {
        let digest = format!("{:x}", Sha256::digest(bytes));
        let path = self.blob_path(&digest);
        let _guard = self.write_lock.lock().await;
        if !fs::try_exists(&path).await? {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::write(&path, bytes).await?;
        }
        Ok(ArtifactRef {
            algorithm: DigestAlgorithm::Sha256,
            digest,
            media_type: media_type.into(),
            size: bytes.len() as u64,
        })
    }
}

/// Content-addressed manifest for the reusable parts of a snapshot. Branch
/// identity and event cursor remain per-snapshot; equal components share blobs.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotComponentManifest {
    pub snapshot_id: String,
    pub genome: ArtifactRef,
    pub working_memory: ArtifactRef,
    pub memories: ArtifactRef,
    pub beliefs: ArtifactRef,
    pub tool_outputs: ArtifactRef,
    pub tool_state: ArtifactRef,
    pub runtime_metadata: ArtifactRef,
}

pub struct LocalSnapshotComponentStore {
    artifacts: LocalArtifactStore,
}

impl LocalSnapshotComponentStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            artifacts: LocalArtifactStore::new(root),
        }
    }

    async fn put_json<T: Serialize>(&self, value: &T) -> anyhow::Result<ArtifactRef> {
        self.artifacts
            .put(&serde_json::to_vec(value)?, "application/json")
            .await
    }

    pub async fn store_components(
        &self,
        snapshot: &AgentSnapshot,
    ) -> anyhow::Result<SnapshotComponentManifest> {
        Ok(SnapshotComponentManifest {
            snapshot_id: snapshot.snapshot_id.0.clone(),
            genome: self.put_json(&snapshot.genome).await?,
            working_memory: self.put_json(&snapshot.state.working_memory).await?,
            memories: self.put_json(&snapshot.state.memories).await?,
            beliefs: self.put_json(&snapshot.state.beliefs).await?,
            tool_outputs: self.put_json(&snapshot.state.tool_outputs).await?,
            tool_state: self.put_json(&snapshot.tool_state).await?,
            runtime_metadata: self.put_json(&snapshot.runtime_metadata).await?,
        })
    }

    pub fn component_path(&self, digest: &str) -> PathBuf {
        self.artifacts.blob_path(digest)
    }
}
