//! Endocrine System mapped to global swarm neuromodulation.
//!
//! Biological mechanism: Hormones are secreted into the bloodstream for slow,
//! durable, and global modulation of organ behavior (e.g., cortisol for stress).
//! GenOS mapping: A global key-value store broadcast to all agents in a swarm,
//! setting systemic biases (temperature, search depth, trust thresholds).

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Hormone {
    /// Cortisol: Stress response (lowers exploration, increases focus/depth)
    Cortisol,
    /// Adrenaline: Speed (lowers depth, increases fast heuristics)
    Adrenaline,
    /// Oxytocin: Trust (increases cooperation and merging threshold with peers)
    Oxytocin,
    /// Custom synthetic hormone for domain specific uses
    Synthetic(String),
}

impl Hormone {
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "cortisol" => Self::Cortisol,
            "adrenaline" => Self::Adrenaline,
            "oxytocin" => Self::Oxytocin,
            _ => Self::Synthetic(s.to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EndocrineSystem {
    pub swarm_id: String,
    pub bloodstream: HashMap<Hormone, f64>, // concentration [0.0, 1.0]
}

impl EndocrineSystem {
    pub fn new(swarm_id: String) -> Self {
        Self {
            swarm_id,
            bloodstream: HashMap::new(),
        }
    }

    /// Secretes a hormone, increasing its concentration up to 1.0
    pub fn secrete(&mut self, hormone: Hormone, amount: f64) {
        let current = self.bloodstream.entry(hormone).or_insert(0.0);
        *current = (*current + amount).clamp(0.0, 1.0);
    }

    /// Natural decay of hormones over time (half-life)
    pub fn decay(&mut self, decay_factor: f64) {
        for val in self.bloodstream.values_mut() {
            *val *= 1.0 - decay_factor.clamp(0.0, 1.0);
            if *val < 0.01 {
                *val = 0.0;
            }
        }
    }

    pub fn get_concentration(&self, hormone: &Hormone) -> f64 {
        self.bloodstream.get(hormone).cloned().unwrap_or(0.0)
    }
}
