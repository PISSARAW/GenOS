//! Allostatic Planning (Predictive Coding & Allostasis).
//! Launches predictive simulations and collects evidence before consuming tokens.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prediction {
    pub action: String,
    pub expected_outcome: String,
    pub metabolic_cost: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub prediction_id: usize,
    pub validation_score: f32,
}

#[derive(Debug, Clone, Default)]
pub struct AllostaticModel {
    pub predictions: Vec<Prediction>,
    pub evidences: Vec<Evidence>,
}

impl AllostaticModel {
    pub fn predict(&mut self, action: String, expected_outcome: String, cost: f32) -> usize {
        let id = self.predictions.len();
        self.predictions.push(Prediction { action, expected_outcome, metabolic_cost: cost });
        id
    }

    pub fn collect_evidence(&mut self, id: usize, score: f32) -> Result<(), String> {
        if id < self.predictions.len() {
            self.evidences.push(Evidence { prediction_id: id, validation_score: score });
            Ok(())
        } else {
            Err("Prediction ID not found".to_string())
        }
    }

    pub fn evaluate_viability(&self) -> f32 {
        if self.evidences.is_empty() { return 0.0; }
        let total_score: f32 = self.evidences.iter().map(|e| e.validation_score).sum();
        total_score / (self.evidences.len() as f32)
    }
}
