use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const DEFAULT_MAX_INTENSITY: f64 = 100.0;
pub const MIN_RETENTION_THRESHOLD: f64 = 0.001;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Pheromone {
    pub marker: String,
    pub intensity: f64,
    pub decay_rate: f64,
    #[serde(default)]
    pub is_repellent: bool,
    #[serde(default = "default_max_intensity")]
    pub max_intensity: f64,
}

fn default_max_intensity() -> f64 {
    DEFAULT_MAX_INTENSITY
}

impl Pheromone {
    pub fn new(marker: &str, intensity: f64, decay_rate: f64) -> Self {
        let max_cap = DEFAULT_MAX_INTENSITY;
        let clamped = intensity.clamp(-max_cap, max_cap);
        Self {
            marker: marker.to_string(),
            intensity: clamped,
            decay_rate: decay_rate.clamp(0.0, 1.0),
            is_repellent: clamped < 0.0,
            max_intensity: max_cap,
        }
    }

    pub fn new_repellent(marker: &str, intensity: f64, decay_rate: f64) -> Self {
        let abs_intensity = intensity.abs().clamp(0.0, DEFAULT_MAX_INTENSITY);
        Self {
            marker: marker.to_string(),
            intensity: -abs_intensity,
            decay_rate: decay_rate.clamp(0.0, 1.0),
            is_repellent: true,
            max_intensity: DEFAULT_MAX_INTENSITY,
        }
    }

    /// Applique une décroissance exponentielle continue : I(t + dt) = I(t) * e^(-decay_rate * dt)
    pub fn evaporate_dt(&mut self, dt_seconds: f64) {
        if dt_seconds <= 0.0 {
            return;
        }
        let factor = (-self.decay_rate * dt_seconds).exp();
        self.intensity *= factor;
    }

    /// Applique une décroissance discrète simple
    pub fn evaporate(&mut self) {
        self.intensity *= 1.0 - self.decay_rate;
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StigmergyField {
    pub pheromones: HashMap<String, Pheromone>,
    pub default_decay: f64,
    #[serde(default = "default_max_intensity")]
    pub max_intensity: f64,
}

impl Default for StigmergyField {
    fn default() -> Self {
        Self::new(0.1)
    }
}

impl StigmergyField {
    pub fn new(default_decay: f64) -> Self {
        Self {
            pheromones: HashMap::new(),
            default_decay: default_decay.clamp(0.0, 1.0),
            max_intensity: DEFAULT_MAX_INTENSITY,
        }
    }

    pub fn with_max_intensity(mut self, max_intensity: f64) -> Self {
        if max_intensity > 0.0 && max_intensity.is_finite() {
            self.max_intensity = max_intensity;
        }
        self
    }

    /// Dépôt standard de phéromone avec saturation max_intensity
    pub fn deposit(&mut self, marker: &str, amount: f64) {
        if !amount.is_finite() || amount <= 0.0 {
            return;
        }
        let decay = self.default_decay;
        let max_cap = self.max_intensity;
        let phero = self.pheromones.entry(marker.to_string()).or_insert_with(|| {
            Pheromone {
                marker: marker.to_string(),
                intensity: 0.0,
                decay_rate: decay,
                is_repellent: false,
                max_intensity: max_cap,
            }
        });

        phero.intensity = (phero.intensity + amount).clamp(-phero.max_intensity, phero.max_intensity);
        phero.is_repellent = phero.intensity < 0.0;
    }

    /// Dépôt d'une phéromone répulsive (anti-stigmergie) pour marquer une impasse ou un échec
    pub fn deposit_repellent(&mut self, marker: &str, amount: f64) {
        if !amount.is_finite() || amount <= 0.0 {
            return;
        }
        let decay = self.default_decay;
        let max_cap = self.max_intensity;
        let phero = self.pheromones.entry(marker.to_string()).or_insert_with(|| {
            Pheromone {
                marker: marker.to_string(),
                intensity: 0.0,
                decay_rate: decay,
                is_repellent: true,
                max_intensity: max_cap,
            }
        });

        phero.intensity = (phero.intensity - amount).clamp(-phero.max_intensity, phero.max_intensity);
        phero.is_repellent = phero.intensity < 0.0;
    }

    /// Dépôt d'une instance complète de Pheromone
    pub fn deposit_pheromone(&mut self, pheromone: Pheromone) {
        let entry = self.pheromones.entry(pheromone.marker.clone()).or_insert_with(|| {
            Pheromone {
                marker: pheromone.marker.clone(),
                intensity: 0.0,
                decay_rate: pheromone.decay_rate,
                is_repellent: pheromone.is_repellent,
                max_intensity: pheromone.max_intensity,
            }
        });
        entry.intensity = (entry.intensity + pheromone.intensity).clamp(-entry.max_intensity, entry.max_intensity);
        entry.decay_rate = pheromone.decay_rate;
        entry.is_repellent = entry.intensity < 0.0;
    }

    /// Lecture de l'intensité (positive ou négative)
    pub fn read(&self, marker: &str) -> f64 {
        self.pheromones.get(marker).map(|p| p.intensity).unwrap_or(0.0)
    }

    /// Obtient une référence vers la phéromone complète
    pub fn get_pheromone(&self, marker: &str) -> Option<&Pheromone> {
        self.pheromones.get(marker)
    }

    /// Évaporation discrète pour toutes les phéromones
    pub fn evaporate(&mut self) {
        self.pheromones.retain(|_, p| {
            p.evaporate();
            p.intensity.abs() > MIN_RETENTION_THRESHOLD
        });
    }

    /// Évaporation continue basée sur un temps écoulé dt en secondes : I(t + dt) = I(t) * e^(-decay_rate * dt)
    pub fn evaporate_dt(&mut self, dt_seconds: f64) {
        if dt_seconds <= 0.0 {
            return;
        }
        self.pheromones.retain(|_, p| {
            p.evaporate_dt(dt_seconds);
            p.intensity.abs() > MIN_RETENTION_THRESHOLD
        });
    }

    /// Fusionne directement un autre champ stigmergique par sommation vectorielle continue
    pub fn merge_field(&mut self, other: &StigmergyField) {
        for (marker, phero) in &other.pheromones {
            self.deposit(marker, phero.intensity);
        }
    }

    /// Sélectionne le marqueur avec la plus forte intensité d'attraction
    pub fn dominant_trail(&self) -> Option<(String, f64)> {
        self.pheromones.iter()
            .filter(|(_, p)| !p.is_repellent)
            .max_by(|a, b| a.1.intensity.partial_cmp(&b.1.intensity).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(m, p)| (m.clone(), p.intensity))
    }

    /// Calcule le score global de consensus d'essaim (différence normalisée entre attraction et répulsion)
    pub fn swarm_consensus_balance(&self) -> f64 {
        let mut attraction = 0.0;
        let mut repulsion = 0.0;
        for p in self.pheromones.values() {
            if p.is_repellent {
                repulsion += p.intensity.abs();
            } else {
                attraction += p.intensity;
            }
        }
        let total = attraction + repulsion;
        if total == 0.0 { 0.0 } else { (attraction - repulsion) / total }
    }

    /// Sérialisation JSON
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Désérialisation JSON
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json_str)
    }
}
