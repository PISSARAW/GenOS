use async_trait::async_trait;
use genos_core::{AgentWorldCapsule, CapsuleId};
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

#[async_trait]
pub trait CapsuleStore: Send + Sync {
    async fn save_capsule(&self, capsule: AgentWorldCapsule) -> anyhow::Result<()>;
    async fn get_capsule(&self, capsule_id: String) -> anyhow::Result<Option<AgentWorldCapsule>>;
    async fn list_branch_capsules(
        &self,
        branch_id: String,
    ) -> anyhow::Result<Vec<AgentWorldCapsule>>;

    /// Every stored capsule, oldest first, with integrity already verified.
    /// Backs lineage-wide queries such as the bud-scar registry.
    async fn list_all_capsules(&self) -> anyhow::Result<Vec<AgentWorldCapsule>>;
}

pub struct LocalCapsuleStore {
    file_path: PathBuf,
    write_lock: Mutex<()>,
}

impl LocalCapsuleStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        Self {
            file_path: file_path.into(),
            write_lock: Mutex::new(()),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        Self::new(
            root.as_ref()
                .join("capsules")
                .join("agent-world-capsules.jsonl"),
        )
    }

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    async fn read_all(&self) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        if !fs::try_exists(&self.file_path).await? {
            return Ok(vec![]);
        }
        let raw = fs::read_to_string(&self.file_path).await?;
        raw.lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty())
            .map(|(index, line)| {
                let capsule: AgentWorldCapsule = serde_json::from_str(line).map_err(|error| {
                    anyhow::anyhow!("invalid capsule at line {}: {error}", index + 1)
                })?;
                if !capsule.verify_integrity() {
                    anyhow::bail!(
                        "capsule {} failed integrity verification",
                        capsule.capsule_id.0
                    );
                }
                Ok(capsule)
            })
            .collect()
    }
}

#[async_trait]
impl CapsuleStore for LocalCapsuleStore {
    async fn save_capsule(&self, capsule: AgentWorldCapsule) -> anyhow::Result<()> {
        if !capsule.verify_integrity() {
            anyhow::bail!("refusing to store capsule with invalid integrity digest");
        }
        let _guard = self.write_lock.lock().await;
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await?;
        let mut line = serde_json::to_vec(&capsule)?;
        line.push(b'\n');
        file.write_all(&line).await?;
        file.flush().await?;
        Ok(())
    }

    async fn get_capsule(&self, capsule_id: String) -> anyhow::Result<Option<AgentWorldCapsule>> {
        let id = CapsuleId(capsule_id);
        Ok(self
            .read_all()
            .await?
            .into_iter()
            .rev()
            .find(|capsule| capsule.capsule_id == id))
    }

    async fn list_branch_capsules(
        &self,
        branch_id: String,
    ) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        Ok(self
            .read_all()
            .await?
            .into_iter()
            .filter(|capsule| capsule.branch_id.0 == branch_id)
            .collect())
    }

    async fn list_all_capsules(&self) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        self.read_all().await
    }
}
