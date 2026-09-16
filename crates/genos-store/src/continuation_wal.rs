use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufReader, BufWriter, Write};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ContinuationEntry {
    pub seq_id: u64,
    pub entry_type: ContinuationType,
    pub payload_hash: String,
    pub payload: serde_json::Value,
    pub dependencies: Vec<u64>,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ContinuationType {
    Barrier,
    Promise,
    ActiveProcess,
    Checkpoint,
}

impl ContinuationEntry {
    pub fn new(
        seq_id: u64,
        entry_type: ContinuationType,
        payload: serde_json::Value,
        dependencies: Vec<u64>,
    ) -> Self {
        let payload_str = serde_json::to_string(&payload).unwrap_or_default();
        let payload_hash = sha2::Sha256::digest(payload_str.as_bytes());
        let payload_hash = hex::encode(payload_hash);

        Self {
            seq_id,
            entry_type,
            payload_hash,
            payload,
            dependencies,
            timestamp: Utc::now().to_rfc3339(),
        }
    }

    pub fn verify(&self) -> bool {
        let payload_str = serde_json::to_string(&self.payload).unwrap_or_default();
        let computed_hash = sha2::Sha256::digest(payload_str.as_bytes());
        let computed_hash = hex::encode(computed_hash);
        computed_hash == self.payload_hash
    }
}

pub struct ContinuationWal {
    path: PathBuf,
    current_seq: u64,
    entries: HashMap<u64, ContinuationEntry>,
    writer: BufWriter<fs::File>,
}

impl ContinuationWal {
    pub fn new(store_dir: impl Into<PathBuf>) -> std::io::Result<Self> {
        let store_dir = store_dir.into();
        fs::create_dir_all(&store_dir)?;

        let wal_path = store_dir.join("continuations.wal");
        let mut entries = HashMap::new();
        let mut current_seq = 0;

        if wal_path.exists() {
            let file = fs::File::open(&wal_path)?;
            let reader = BufReader::new(file);
            for line in std::io::BufRead::lines(reader) {
                let line = line?;
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(entry) = serde_json::from_str::<ContinuationEntry>(&line) {
                    current_seq = current_seq.max(entry.seq_id);
                    entries.insert(entry.seq_id, entry);
                }
            }
        }

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&wal_path)?;
        let writer = BufWriter::new(file);

        Ok(Self {
            path: wal_path,
            current_seq,
            entries,
            writer,
        })
    }

    pub fn append(
        &mut self,
        entry_type: ContinuationType,
        payload: serde_json::Value,
        dependencies: Vec<u64>,
    ) -> std::io::Result<u64> {
        self.current_seq += 1;
        let entry = ContinuationEntry::new(self.current_seq, entry_type, payload, dependencies);

        let json = serde_json::to_string(&entry)?;
        self.writer.write_all(json.as_bytes())?;
        self.writer.write_all(b"\n")?;
        self.writer.flush()?;

        self.entries.insert(self.current_seq, entry);
        Ok(self.current_seq)
    }

    pub fn get(&self, seq_id: u64) -> Option<&ContinuationEntry> {
        self.entries.get(&seq_id)
    }

    pub fn read_from(&self, from_seq: u64) -> Vec<&ContinuationEntry> {
        self.entries
            .values()
            .filter(|e| e.seq_id >= from_seq)
            .collect()
    }

    pub fn read_all(&self) -> Vec<&ContinuationEntry> {
        let mut entries: Vec<_> = self.entries.values().collect();
        entries.sort_by_key(|e| e.seq_id);
        entries
    }

    pub fn latest_seq(&self) -> u64 {
        self.current_seq
    }

    pub fn verify_integrity(&self) -> bool {
        self.entries.values().all(|e| e.verify())
    }

    pub fn truncate_before(&mut self, seq_id: u64) -> std::io::Result<()> {
        self.entries.retain(|&k, _| k >= seq_id);

        let temp_path = self.path.with_extension("wal.tmp");
        {
            let mut temp_writer = BufWriter::new(fs::File::create(&temp_path)?);
            let mut entries: Vec<_> = self.entries.values().cloned().collect();
            entries.sort_by_key(|e| e.seq_id);
            for entry in entries {
                let json = serde_json::to_string(&entry)?;
                temp_writer.write_all(json.as_bytes())?;
                temp_writer.write_all(b"\n")?;
            }
            temp_writer.flush()?;
        }
        fs::rename(&temp_path, &self.path)?;
        self.writer = BufWriter::new(OpenOptions::new().append(true).open(&self.path)?);
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrchestrationCheckpoint {
    pub seq_id: u64,
    pub orchestrator_state: serde_json::Value,
    pub active_barriers: Vec<ContinuationEntry>,
    pub active_promises: Vec<ContinuationEntry>,
    pub active_processes: Vec<ContinuationEntry>,
    pub timestamp: String,
}

impl OrchestrationCheckpoint {
    pub fn new(seq_id: u64, orchestrator_state: serde_json::Value) -> Self {
        Self {
            seq_id,
            orchestrator_state,
            active_barriers: Vec::new(),
            active_promises: Vec::new(),
            active_processes: Vec::new(),
            timestamp: Utc::now().to_rfc3339(),
        }
    }

    pub fn with_entries(
        mut self,
        barriers: Vec<ContinuationEntry>,
        promises: Vec<ContinuationEntry>,
        processes: Vec<ContinuationEntry>,
    ) -> Self {
        self.active_barriers = barriers;
        self.active_promises = promises;
        self.active_processes = processes;
        self
    }
}

pub struct CheckpointStore {
    path: PathBuf,
}

impl CheckpointStore {
    pub fn new(store_dir: impl Into<PathBuf>) -> std::io::Result<Self> {
        let store_dir = store_dir.into();
        fs::create_dir_all(&store_dir)?;
        Ok(Self {
            path: store_dir.join("orchestration.checkpoint.json"),
        })
    }

    pub fn save(&self, checkpoint: &OrchestrationCheckpoint) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(checkpoint)?;
        fs::write(&self.path, json)
    }

    pub fn load(&self) -> std::io::Result<Option<OrchestrationCheckpoint>> {
        if !self.path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&self.path)?;
        let checkpoint = serde_json::from_str(&content)?;
        Ok(Some(checkpoint))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn wal_append_and_read() {
        let dir = tempdir().unwrap();
        let mut wal = ContinuationWal::new(dir.path()).unwrap();

        let seq1 = wal.append(
            ContinuationType::Barrier,
            serde_json::json!({ "barrier_id": "b1", "state": "pending" }),
            vec![],
        ).unwrap();

        let seq2 = wal.append(
            ContinuationType::Promise,
            serde_json::json!({ "promise_id": "p1", "status": "pending" }),
            vec![seq1],
        ).unwrap();

        assert_eq!(seq1, 1);
        assert_eq!(seq2, 2);

        let entry1 = wal.get(seq1).unwrap();
        assert_eq!(entry1.entry_type, ContinuationType::Barrier);
        assert!(entry1.verify());

        let entry2 = wal.get(seq2).unwrap();
        assert_eq!(entry2.entry_type, ContinuationType::Promise);
        assert_eq!(entry2.dependencies, vec![seq1]);
    }

    #[test]
    fn wal_persistence_across_restart() {
        let dir = tempdir().unwrap();
        {
            let mut wal = ContinuationWal::new(dir.path()).unwrap();
            wal.append(ContinuationType::Barrier, serde_json::json!({ "id": "b1" }), vec![]).unwrap();
            wal.append(ContinuationType::Promise, serde_json::json!({ "id": "p1" }), vec![]).unwrap();
        }

        let wal = ContinuationWal::new(dir.path()).unwrap();
        assert_eq!(wal.latest_seq(), 2);
        assert_eq!(wal.read_all().len(), 2);
    }

    #[test]
    fn wal_verify_integrity() {
        let dir = tempdir().unwrap();
        let mut wal = ContinuationWal::new(dir.path()).unwrap();
        wal.append(ContinuationType::Barrier, serde_json::json!({ "id": "b1" }), vec![]).unwrap();
        assert!(wal.verify_integrity());
    }

    #[test]
    fn checkpoint_save_and_load() {
        let dir = tempdir().unwrap();
        let store = CheckpointStore::new(dir.path()).unwrap();

        let checkpoint = OrchestrationCheckpoint::new(5, serde_json::json!({ "state": "running" }));
        store.save(&checkpoint).unwrap();

        let loaded = store.load().unwrap().unwrap();
        assert_eq!(loaded.seq_id, 5);
        assert_eq!(loaded.orchestrator_state["state"], "running");
    }
}