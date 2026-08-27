//! Active Sensing (Echolocation) for requirement gathering.
//! Replaces standard "grill-me" interrogation by emitting rapid
//! clarification "clicks" to map the constraint space.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensingClick {
    pub id: String,
    pub focus: String,
    pub ambiguity_level: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoResponse {
    pub click_id: String,
    pub resolution: String,
    pub constraint_mapped: bool,
}

#[derive(Debug, Clone, Default)]
pub struct EcholocationState {
    pub clicks: Vec<SensingClick>,
    pub echoes: Vec<EchoResponse>,
    pub map_completeness: f32,
}

impl EcholocationState {
    pub fn emit_click(&mut self, focus: String, ambiguity: f32) -> String {
        let id = format!("click-{}", self.clicks.len());
        self.clicks.push(SensingClick {
            id: id.clone(),
            focus,
            ambiguity_level: ambiguity,
        });
        id
    }

    pub fn receive_echo(&mut self, click_id: String, resolution: String, mapped: bool) {
        self.echoes.push(EchoResponse {
            click_id,
            resolution,
            constraint_mapped: mapped,
        });
        self.update_map();
    }

    fn update_map(&mut self) {
        let mapped_count = self.echoes.iter().filter(|e| e.constraint_mapped).count();
        let total = self.clicks.len().max(1) as f32;
        self.map_completeness = (mapped_count as f32) / total;
    }
}
