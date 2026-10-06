//! Calibration descriptive de coûts observés, sans apprentissage des seuils de sécurité.
use crate::planner::Concept;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RunningObservation {
    pub count: u64,
    pub mean: f64,
    pub squared_deviations: f64,
}

impl RunningObservation {
    pub fn observe(&mut self, value: f64) {
        if !value.is_finite() || value < 0.0 || self.count == u64::MAX {
            return;
        }
        let count = self.count + 1;
        let delta = value - self.mean;
        let mean = self.mean + delta / count as f64;
        let squared_deviations = self.squared_deviations + delta * (value - mean);
        if !mean.is_finite() || !squared_deviations.is_finite() {
            return;
        }
        self.count = count;
        self.mean = mean;
        self.squared_deviations = squared_deviations;
    }
    pub fn valid(&self) -> bool {
        self.mean.is_finite()
            && self.mean >= 0.0
            && self.squared_deviations.is_finite()
            && self.squared_deviations >= -1e-6
            && (self.count > 0 || (self.mean == 0.0 && self.squared_deviations == 0.0))
    }
    pub fn reference(&self, default: f64, bounds: (f64, f64)) -> f64 {
        if self.count < 3 || !self.valid() {
            return default;
        }
        let deviation = (self.squared_deviations.max(0.0) / self.count as f64).sqrt();
        (self.mean + deviation).clamp(bounds.0, bounds.1)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ActionObservation {
    pub atp: RunningObservation,
    pub latency_ms: RunningObservation,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct MissionPhysicsProfile {
    pub schema_version: u32,
    pub episodes: u64,
    pub successes: u64,
    /// Compatibilité des snapshots v1; la politique v2 utilise les références observées.
    pub friction_scale: f64,
    pub consumed_atp: RunningObservation,
    pub elapsed_ms: RunningObservation,
    pub context_bytes: RunningObservation,
    pub dependency_edges: RunningObservation,
    pub actions: BTreeMap<Concept, ActionObservation>,
}

impl Default for MissionPhysicsProfile {
    fn default() -> Self {
        Self {
            schema_version: 2,
            episodes: 0,
            successes: 0,
            friction_scale: 1.0,
            consumed_atp: RunningObservation::default(),
            elapsed_ms: RunningObservation::default(),
            context_bytes: RunningObservation::default(),
            dependency_edges: RunningObservation::default(),
            actions: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct EpisodeObservation {
    pub success: bool,
    pub consumed_atp: f64,
    pub elapsed_ms: f64,
    pub context_bytes: Option<usize>,
    pub dependency_edges: Option<usize>,
    pub actions: Vec<(Concept, f64, f64)>,
}

impl MissionPhysicsProfile {
    pub fn valid(&self) -> bool {
        self.schema_version == 2
            && self.successes <= self.episodes
            && self.friction_scale.is_finite()
            && (0.8..=1.2).contains(&self.friction_scale)
            && [
                &self.consumed_atp,
                &self.elapsed_ms,
                &self.context_bytes,
                &self.dependency_edges,
            ]
            .iter()
            .all(|value| value.valid() && value.count <= self.episodes)
            && self
                .actions
                .values()
                .all(|action| action.atp.valid() && action.latency_ms.valid())
    }

    pub fn record_episode(&mut self, success: bool) {
        self.episodes = self.episodes.saturating_add(1);
        self.successes = self.successes.saturating_add(if success { 1 } else { 0 });
    }

    pub fn observe(&mut self, episode: &EpisodeObservation) {
        if !episode.consumed_atp.is_finite() || episode.consumed_atp <= 0.0 {
            return;
        }
        self.record_episode(episode.success);
        self.consumed_atp.observe(episode.consumed_atp);
        self.elapsed_ms.observe(episode.elapsed_ms);
        if let Some(bytes) = episode.context_bytes {
            self.context_bytes.observe(bytes as f64);
        }
        if let Some(edges) = episode.dependency_edges {
            self.dependency_edges.observe(edges as f64);
        }
        for (concept, atp, latency) in &episode.actions {
            let action = self.actions.entry(*concept).or_default();
            action.atp.observe(*atp);
            action.latency_ms.observe(*latency);
        }
    }

    pub fn budget_reference(&self) -> f64 {
        self.consumed_atp.reference(120.0, (60.0, 240.0))
    }
    pub fn context_reference(&self) -> f64 {
        self.context_bytes
            .reference(1_000_000.0, (32_000.0, 2_000_000.0))
    }
    pub fn dependency_reference(&self) -> f64 {
        self.dependency_edges.reference(2_000.0, (100.0, 10_000.0))
    }
    pub fn latency_reference(&self) -> f64 {
        self.elapsed_ms.reference(1_000.0, (10.0, 60_000.0))
    }
}

pub(crate) fn valid_mission_key(key: &str) -> bool {
    matches!(
        key,
        "secure-perimeter" | "recover-agent" | "repair-module" | "explore" | "conserve"
    )
}
