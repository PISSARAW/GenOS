use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FrozenAgent {
    pub agent_id: String,
    pub state_snapshot: serde_json::Value,
    pub frozen_at: String,
    pub hydration_level: f64,
}

#[derive(Default)]
pub struct CryptobiosisStore {
    vault: HashMap<String, FrozenAgent>,
}

impl CryptobiosisStore {
    pub fn new() -> Self {
        Self {
            vault: HashMap::new(),
        }
    }

    pub fn freeze(&mut self, agent_id: &str, state_snapshot: serde_json::Value) -> FrozenAgent {
        let frozen = FrozenAgent {
            agent_id: agent_id.to_string(),
            state_snapshot,
            frozen_at: Utc::now().to_rfc3339(),
            hydration_level: 0.0,
        };
        self.vault.insert(agent_id.to_string(), frozen.clone());
        frozen
    }

    pub fn thaw(&mut self, agent_id: &str) -> Option<FrozenAgent> {
        self.vault.remove(agent_id)
    }

    pub fn is_dormant(&self, agent_id: &str) -> bool {
        self.vault.contains_key(agent_id)
    }
}
