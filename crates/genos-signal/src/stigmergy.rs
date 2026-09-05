use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Pheromone {
    pub marker: String,
    pub intensity: f64,
    pub decay_rate: f64,
}

#[derive(Clone, Debug, Default)]
pub struct StigmergyField {
    pub markers: HashMap<String, f64>,
    pub default_decay: f64,
}

impl StigmergyField {
    pub fn new(default_decay: f64) -> Self {
        Self {
            markers: HashMap::new(),
            default_decay,
        }
    }

    pub fn deposit(&mut self, marker: &str, amount: f64) {
        let entry = self.markers.entry(marker.to_string()).or_insert(0.0);
        *entry += amount;
    }

    pub fn read(&self, marker: &str) -> f64 {
        self.markers.get(marker).copied().unwrap_or(0.0)
    }

    pub fn evaporate(&mut self) {
        self.markers.retain(|_, intensity| {
            *intensity *= 1.0 - self.default_decay;
            *intensity > 0.001
        });
    }
}
