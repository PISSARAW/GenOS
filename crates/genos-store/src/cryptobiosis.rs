use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SporeVitrifiedPayload {
    pub payload_hash: String,
    pub raw_blob: Vec<u8>,
    pub trehalose_concentration: f64,
    pub bunker_armor: u32,
    pub vitrified_at: String,
}

impl SporeVitrifiedPayload {
    pub fn new(data: &[u8], trehalose: f64, armor: u32) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash = format!("{:x}", hasher.finalize());
        Self {
            payload_hash: hash,
            raw_blob: data.to_vec(),
            trehalose_concentration: trehalose.clamp(0.0, 1.0),
            bunker_armor: armor,
            vitrified_at: Utc::now().to_rfc3339(),
        }
    }

    pub fn germinate(&self, warm_and_wet: bool, nutrients: bool) -> Result<&[u8], String> {
        if self.trehalose_concentration < 0.2 {
            return Err("OSMOTIC_COLLAPSE: Insufficient trehalose cryoprotection".to_string());
        }
        if !warm_and_wet || !nutrients {
            return Err("DORMANT: Spore remains vitrified due to unfavorable environment".to_string());
        }
        Ok(&self.raw_blob)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FrozenAgent {
    pub agent_id: String,
    #[serde(default)]
    pub state_snapshot: serde_json::Value,
    #[serde(default)]
    pub vitrified_spore: Option<SporeVitrifiedPayload>,
    pub frozen_at: String,
    pub hydration_level: f64,
}

#[derive(Default)]
pub struct CryptobiosisStore {
    vault: HashMap<String, FrozenAgent>,
}

pub struct VitrifiedFreeze<'a> {
    pub agent_id: &'a str,
    pub data: &'a [u8],
    pub trehalose: f64,
    pub armor: u32,
}

pub struct VitrifiedThaw<'a> {
    pub agent_id: &'a str,
    pub warm_and_wet: bool,
    pub nutrients: bool,
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
            vitrified_spore: None,
            frozen_at: Utc::now().to_rfc3339(),
            hydration_level: 0.0,
        };
        self.vault.insert(agent_id.to_string(), frozen.clone());
        frozen
    }

    pub fn freeze_vitrified(&mut self, config: VitrifiedFreeze<'_>) -> FrozenAgent {
        let spore = SporeVitrifiedPayload::new(config.data, config.trehalose, config.armor);
        let frozen = FrozenAgent {
            agent_id: config.agent_id.to_string(),
            state_snapshot: serde_json::Value::Null,
            vitrified_spore: Some(spore),
            frozen_at: Utc::now().to_rfc3339(),
            hydration_level: 0.0,
        };
        self.vault.insert(config.agent_id.to_string(), frozen.clone());
        frozen
    }

    pub fn thaw(&mut self, agent_id: &str) -> Option<FrozenAgent> {
        self.vault.remove(agent_id)
    }

    pub fn thaw_vitrified(&mut self, config: VitrifiedThaw<'_>) -> Result<Vec<u8>, String> {
        let agent = self.vault.remove(config.agent_id).ok_or_else(|| format!("Agent '{}' not found in cryptobiosis store", config.agent_id))?;
        let spore = agent.vitrified_spore.ok_or_else(|| format!("Agent '{}' has no vitrified spore payload", config.agent_id))?;
        let bytes = spore.germinate(config.warm_and_wet, config.nutrients)?;
        Ok(bytes.to_vec())
    }

    pub fn is_dormant(&self, agent_id: &str) -> bool {
        self.vault.contains_key(agent_id)
    }
}
