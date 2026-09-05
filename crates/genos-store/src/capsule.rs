use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt::Write;
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
