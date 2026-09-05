use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FossilRecord {
    pub fossil_id: Uuid,
    pub extinct_lineage_id: String,
    pub reason: String,
    pub recorded_at: String,
}

#[derive(Default)]
pub struct FossilRegistry {
    records: Vec<FossilRecord>,
}

impl FossilRegistry {
    pub fn new() -> Self {
        Self { records: Vec::new() }
    }

    pub fn fossilize(&mut self, lineage_id: &str, reason: &str) -> FossilRecord {
        let rec = FossilRecord {
            fossil_id: Uuid::new_v4(),
            extinct_lineage_id: lineage_id.to_string(),
            reason: reason.to_string(),
            recorded_at: Utc::now().to_rfc3339(),
        };
        self.records.push(rec.clone());
        rec
    }

    pub fn all_fossils(&self) -> &[FossilRecord] {
        &self.records
    }
}
