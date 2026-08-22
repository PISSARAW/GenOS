use async_trait::async_trait;
use genos_core::ids::SnapshotId;
use genos_core::snapshot::SnapshotComponentManifest as LegacySnapshotManifest;
use genos_core::AgentSnapshot;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

/// Append-only store for complete agent snapshots.
///
/// Component-level content-addressed storage is provided separately by
/// `LocalSnapshotComponentStore`. This store remains the durable, directly
/// replayable JSONL contract used by the CLI and demos.
#[async_trait]
pub trait SnapshotStore: Send + Sync {
    async fn load_snapshot(&self, id: &SnapshotId) -> anyhow::Result<Option<AgentSnapshot>>;
    async fn save_snapshot(&self, snapshot: &AgentSnapshot) -> anyhow::Result<()>;
}

pub struct LocalSnapshotStore {
    file_path: PathBuf,
    legacy_manifest_path: Option<PathBuf>,
    write_lock: Mutex<()>,
}

enum SnapshotJournalRecord {
    LegacyManifest(LegacySnapshotManifest),
    FullSnapshot(Box<AgentSnapshot>),
}

fn parse_journal_record(line: &str, line_number: usize) -> anyhow::Result<SnapshotJournalRecord> {
    let value: serde_json::Value = serde_json::from_str(line)
        .map_err(|e| anyhow::anyhow!("invalid snapshot JSON at line {line_number}: {e}"))?;
    let is_legacy_manifest = value.as_object().is_some_and(|object| {
        let legacy_keys = [
            "snapshot_id",
            "agent_id",
            "branch_id",
            "genome_hash",
            "state_hash",
            "ssm_state_hash",
        ];
        object.len() == legacy_keys.len() && legacy_keys.iter().all(|key| object.contains_key(*key))
    });

    if is_legacy_manifest {
        return serde_json::from_value(value)
            .map(SnapshotJournalRecord::LegacyManifest)
            .map_err(|e| {
                anyhow::anyhow!("invalid legacy snapshot manifest at line {line_number}: {e}")
            });
    }

    serde_json::from_value(value)
        .map(Box::new)
        .map(SnapshotJournalRecord::FullSnapshot)
        .map_err(|e| anyhow::anyhow!("invalid snapshot at line {line_number}: {e}"))
}

impl LocalSnapshotStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        let requested_path = file_path.into();
        let is_legacy_path = requested_path
            .file_name()
            .is_some_and(|name| name == std::ffi::OsStr::new("agent-snapshots-manifests.jsonl"));
        let (file_path, legacy_manifest_path) = if is_legacy_path {
            (
                requested_path.with_file_name("agent-snapshots.jsonl"),
                Some(requested_path),
            )
        } else {
            (requested_path, None)
        };
        Self {
            file_path,
            legacy_manifest_path,
            write_lock: Mutex::new(()),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let snapshots_dir = root.as_ref().join("snapshots");
        Self {
            file_path: snapshots_dir.join("agent-snapshots.jsonl"),
            legacy_manifest_path: Some(snapshots_dir.join("agent-snapshots-manifests.jsonl")),
            write_lock: Mutex::new(()),
        }
    }

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    /// Resolve a snapshot id through the store's high-level loading contract.
    pub async fn get_snapshot(&self, id: String) -> anyhow::Result<Option<AgentSnapshot>> {
        self.load_snapshot(&SnapshotId(id)).await
    }

    pub async fn list_snapshot_ids(&self) -> anyhow::Result<Vec<String>> {
        let mut ids = Vec::new();
        let mut seen = HashSet::new();

        // The legacy journal only contains component manifests with placeholder
        // hashes, so it cannot be losslessly converted into full snapshots.
        // Keep it as a read-only index rather than deleting or fabricating state.
        if let Some(path) = &self.legacy_manifest_path {
            if fs::try_exists(path).await? {
                let raw = fs::read_to_string(path).await?;
                for (idx, line) in raw.lines().enumerate() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let manifest: LegacySnapshotManifest =
                        serde_json::from_str(line).map_err(|e| {
                            anyhow::anyhow!(
                                "invalid legacy snapshot manifest at line {}: {e}",
                                idx + 1
                            )
                        })?;
                    if seen.insert(manifest.snapshot_id.0.clone()) {
                        ids.push(manifest.snapshot_id.0);
                    }
                }
            }
        }

        if fs::try_exists(&self.file_path).await? {
            let raw = fs::read_to_string(&self.file_path).await?;
            for (idx, line) in raw.lines().enumerate() {
                if line.trim().is_empty() {
                    continue;
                }
                let snapshot_id = match parse_journal_record(line, idx + 1)? {
                    SnapshotJournalRecord::LegacyManifest(manifest) => manifest.snapshot_id,
                    SnapshotJournalRecord::FullSnapshot(snapshot) => snapshot.snapshot_id,
                };

                if seen.insert(snapshot_id.0.clone()) {
                    ids.push(snapshot_id.0);
                }
            }
        }
        Ok(ids)
    }
}

#[async_trait]
impl SnapshotStore for LocalSnapshotStore {
    async fn load_snapshot(&self, id: &SnapshotId) -> anyhow::Result<Option<AgentSnapshot>> {
        if !fs::try_exists(&self.file_path).await? {
            return Ok(None);
        }

        let raw = fs::read_to_string(&self.file_path).await?;
        let mut found = None;

        // A snapshot id may occur more than once because branch-local writes
        // preserve identity. The latest append is the current durable state.
        for (idx, line) in raw.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }

            match parse_journal_record(line, idx + 1)? {
                SnapshotJournalRecord::LegacyManifest(_) => {}
                SnapshotJournalRecord::FullSnapshot(snapshot) if snapshot.snapshot_id == *id => {
                    found = Some(*snapshot);
                }
                SnapshotJournalRecord::FullSnapshot(_) => {}
            }
        }

        Ok(found)
    }

    async fn save_snapshot(&self, snapshot: &AgentSnapshot) -> anyhow::Result<()> {
        let _guard = self.write_lock.lock().await;

        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await?;

        let mut line = serde_json::to_vec(&snapshot)?;
        line.push(b'\n');
        file.write_all(&line).await?;
        file.flush().await?;

        Ok(())
    }
}
