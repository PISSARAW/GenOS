use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt::Write;
use std::fs::{self, OpenOptions};
use std::io::{Error, ErrorKind, Write as IoWrite};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Capsule {
    pub capsule_id: Uuid,
    pub boundary_id: String,
    pub hash: String,
    pub data: serde_json::Value,
    pub created_at: String,
}

impl Capsule {
    pub fn create(boundary_id: &str, data: serde_json::Value) -> Self {
        let serialized = serde_json::to_string(&data).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let mut hash = String::with_capacity(64);
        for byte in hasher.finalize() {
            write!(&mut hash, "{:02x}", byte).unwrap();
        }

        Self {
            capsule_id: Uuid::new_v4(),
            boundary_id: boundary_id.to_string(),
            hash,
            data,
            created_at: Utc::now().to_rfc3339(),
        }
    }

    pub fn verify(&self) -> bool {
        let serialized = serde_json::to_string(&self.data).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let mut expected = String::with_capacity(64);
        for byte in hasher.finalize() {
            write!(&mut expected, "{:02x}", byte).unwrap();
        }
        self.hash == expected
    }
}

#[derive(Default)]
pub struct CapsuleStore {
    capsules: HashMap<Uuid, Capsule>,
}

impl CapsuleStore {
    pub fn new() -> Self {
        Self {
            capsules: HashMap::new(),
        }
    }

    pub fn store(&mut self, capsule: Capsule) -> Uuid {
        let id = capsule.capsule_id;
        self.capsules.insert(id, capsule);
        id
    }

    pub fn get(&self, id: &Uuid) -> Option<&Capsule> {
        self.capsules.get(id)
    }

    pub fn audit_all(&self) -> Vec<(Uuid, bool)> {
        self.capsules
            .iter()
            .map(|(&id, c)| (id, c.verify()))
            .collect()
    }
}

const CREATIVE_MEMORY_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreativeMemoryCheckpoint {
    pub schema_version: u32,
    pub payload_hash: String,
    pub payload: serde_json::Value,
}

impl CreativeMemoryCheckpoint {
    pub fn new(payload: serde_json::Value) -> Result<Self, serde_json::Error> {
        let encoded = serde_json::to_vec(&payload)?;
        let payload_hash = hex::encode(Sha256::digest(encoded));
        Ok(Self {
            schema_version: CREATIVE_MEMORY_SCHEMA_VERSION,
            payload_hash,
            payload,
        })
    }

    fn validate(&self) -> std::io::Result<()> {
        if self.schema_version != CREATIVE_MEMORY_SCHEMA_VERSION {
            return Err(Error::new(
                ErrorKind::InvalidData,
                "unsupported creative memory checkpoint version",
            ));
        }
        let encoded = serde_json::to_vec(&self.payload)
            .map_err(|error| Error::new(ErrorKind::InvalidData, error))?;
        let hash = hex::encode(Sha256::digest(encoded));
        if hash != self.payload_hash {
            return Err(Error::new(
                ErrorKind::InvalidData,
                "creative memory checkpoint checksum mismatch",
            ));
        }
        Ok(())
    }
}

/// Versioned, checksummed JSON persistence for a creative-memory payload.
pub struct CreativeMemoryStore {
    path: PathBuf,
}

impl CreativeMemoryStore {
    pub fn new(path: impl Into<PathBuf>) -> std::io::Result<Self> {
        let path = path.into();
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(parent)?;
        }
        Ok(Self { path })
    }

    pub fn save(&self, payload: &serde_json::Value) -> std::io::Result<()> {
        let checkpoint = CreativeMemoryCheckpoint::new(payload.clone())
            .map_err(|error| Error::new(ErrorKind::InvalidData, error))?;
        checkpoint.validate()?;
        let temporary = temporary_path(&self.path);
        let result = write_checkpoint(&temporary, &self.path, &checkpoint);
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }

    pub fn load(&self) -> std::io::Result<Option<serde_json::Value>> {
        if !self.path.exists() {
            return Ok(None);
        }
        let content = fs::read(&self.path)?;
        let checkpoint: CreativeMemoryCheckpoint = serde_json::from_slice(&content)
            .map_err(|error| Error::new(ErrorKind::InvalidData, error))?;
        checkpoint.validate()?;
        Ok(Some(checkpoint.payload))
    }
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{}.tmp", Uuid::new_v4()));
    path.with_file_name(name)
}

fn write_checkpoint(
    temporary: &Path,
    destination: &Path,
    checkpoint: &CreativeMemoryCheckpoint,
) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(checkpoint)
        .map_err(|error| Error::new(ErrorKind::InvalidData, error))?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, destination)
}

#[cfg(test)]
mod creative_memory_tests {
    use super::*;

    fn test_path() -> PathBuf {
        std::env::temp_dir().join(format!("genos-creative-{}.json", Uuid::new_v4()))
    }

    #[test]
    fn checkpoint_is_versioned_checksummed_and_survives_reload() {
        let path = test_path();
        let store = CreativeMemoryStore::new(&path).unwrap();
        let expected = serde_json::json!({"tick_counter": 9, "hypotheses": []});
        store.save(&expected).unwrap();
        drop(store);
        let restored = CreativeMemoryStore::new(&path).unwrap().load().unwrap();
        assert_eq!(restored, Some(expected));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn checkpoint_rejects_tampered_payload() {
        let path = test_path();
        let store = CreativeMemoryStore::new(&path).unwrap();
        store.save(&serde_json::json!({"value": 1})).unwrap();
        let mut checkpoint: CreativeMemoryCheckpoint =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        checkpoint.payload["value"] = serde_json::json!(2);
        fs::write(&path, serde_json::to_vec(&checkpoint).unwrap()).unwrap();
        assert_eq!(store.load().unwrap_err().kind(), ErrorKind::InvalidData);
        fs::remove_file(path).unwrap();
    }
}
