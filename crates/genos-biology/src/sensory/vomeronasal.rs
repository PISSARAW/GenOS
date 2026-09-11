use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Types de phéromones captées par l'Organe Voméronasal (VNO)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PheromoneType {
    Alarm,
    AggressionDefense,
    MatingCooperation,
    TerritoryMark,
    Trail,
    Custom(String),
}

/// Signal phéromonal subliminal lourd transmis hors du flux textuel principal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PheromoneSignal {
    pub source_agent: String,
    pub locus: String,
    pub pheromone_type: PheromoneType,
    pub concentration: f64,
    pub half_life_secs: f64,
    pub timestamp_epoch_ms: u64,
    pub subliminal_payload: HashMap<String, String>,
}

impl PheromoneSignal {
    pub fn new(source_agent: &str, locus: &str, ptype: PheromoneType, concentration: f64) -> Self {
        Self {
            source_agent: source_agent.to_string(),
            locus: locus.to_string(),
            pheromone_type: ptype,
            concentration: concentration.clamp(0.0, 1.0),
            half_life_secs: 300.0,
            timestamp_epoch_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            subliminal_payload: HashMap::new(),
        }
    }

    pub fn with_payload(mut self, key: &str, value: &str) -> Self {
        self.subliminal_payload.insert(key.to_string(), value.to_string());
        self
    }
}

/// Réponse comportementale réflexe non-délibérative (Réponse de Flehmen)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlehmenResponse {
    pub triggered: bool,
    pub trigger_pheromone: PheromoneType,
    pub autonomic_action: String,
    pub urgency_score: f64,
    pub bypass_cortical_deliberation: bool,
    pub metabolic_shift: f64,
}

/// Bulbe Olfactif Accessoire (AOB) et Réseau Voméronasal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessoryOlfactoryBulb {
    pub sensitivity_threshold: f64,
    pub active_signals: Vec<PheromoneSignal>,
    pub flehmen_history_count: usize,
}

impl Default for AccessoryOlfactoryBulb {
    fn default() -> Self {
        Self::new(0.15)
    }
}

impl AccessoryOlfactoryBulb {
    pub fn new(sensitivity_threshold: f64) -> Self {
        Self {
            sensitivity_threshold: sensitivity_threshold.clamp(0.01, 1.0),
            active_signals: Vec::new(),
            flehmen_history_count: 0,
        }
    }

    /// Réceptionne et traite un signal phéromonal via l'organe voméronasal
    pub fn receive_signal(&mut self, signal: PheromoneSignal) -> FlehmenResponse {
        let is_detectable = signal.concentration >= self.sensitivity_threshold;
        let ptype = signal.pheromone_type.clone();
        let concentration = signal.concentration;

        if is_detectable {
            self.active_signals.push(signal);
        }

        if !is_detectable {
            return FlehmenResponse {
                triggered: false,
                trigger_pheromone: ptype,
                autonomic_action: "SUBLIMINAL_UNDETECTED".to_string(),
                urgency_score: 0.0,
                bypass_cortical_deliberation: false,
                metabolic_shift: 0.0,
            };
        }

        self.flehmen_history_count += 1;

        match ptype {
            PheromoneType::Alarm => FlehmenResponse {
                triggered: true,
                trigger_pheromone: ptype,
                autonomic_action: "IMMEDIATE_DEFENSIVE_FREEZE_AND_ALERT".to_string(),
                urgency_score: (concentration * 1.5).min(1.0),
                bypass_cortical_deliberation: true,
                metabolic_shift: 0.85,
            },
            PheromoneType::AggressionDefense => FlehmenResponse {
                triggered: true,
                trigger_pheromone: ptype,
                autonomic_action: "MOBILIZE_CYTOTOXIC_RESPONSE".to_string(),
                urgency_score: concentration,
                bypass_cortical_deliberation: true,
                metabolic_shift: 0.70,
            },
            PheromoneType::MatingCooperation => FlehmenResponse {
                triggered: true,
                trigger_pheromone: ptype,
                autonomic_action: "SYNCHRONIZE_SWARM_COOPERATION".to_string(),
                urgency_score: concentration * 0.8,
                bypass_cortical_deliberation: false,
                metabolic_shift: 0.30,
            },
            PheromoneType::TerritoryMark => FlehmenResponse {
                triggered: true,
                trigger_pheromone: ptype,
                autonomic_action: "ENFORCE_BOUNDARY_ISOLATION".to_string(),
                urgency_score: concentration * 0.5,
                bypass_cortical_deliberation: false,
                metabolic_shift: 0.10,
            },
            PheromoneType::Trail => FlehmenResponse {
                triggered: true,
                trigger_pheromone: ptype,
                autonomic_action: "FOLLOW_OPTIMIZED_GRADIENT".to_string(),
                urgency_score: concentration * 0.6,
                bypass_cortical_deliberation: false,
                metabolic_shift: 0.05,
            },
            PheromoneType::Custom(ref name) => {
                let action = format!("CUSTOM_SUBLIMINAL_TRIGGER_{}", name.to_uppercase());
                FlehmenResponse {
                    triggered: true,
                    trigger_pheromone: ptype,
                    autonomic_action: action,
                    urgency_score: concentration * 0.5,
                    bypass_cortical_deliberation: concentration > 0.8,
                    metabolic_shift: concentration * 0.4,
                }
            }
        }
    }

    /// Évaporation temporelle des phéromones
    pub fn decay_pheromones(&mut self, dt_secs: f64) {
        for sig in &mut self.active_signals {
            let decay_rate = (dt_secs / sig.half_life_secs).exp2();
            sig.concentration /= decay_rate.max(1.0);
        }
        self.active_signals.retain(|sig| sig.concentration >= self.sensitivity_threshold * 0.5);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vomeronasal_detection_and_flehmen() {
        let mut aob = AccessoryOlfactoryBulb::new(0.2);
        
        let alarm = PheromoneSignal::new("agent-alpha", "workspace/src", PheromoneType::Alarm, 0.9)
            .with_payload("threat", "toxin_injection");
        let resp = aob.receive_signal(alarm);

        assert!(resp.triggered);
        assert!(resp.bypass_cortical_deliberation);
        assert_eq!(resp.autonomic_action, "IMMEDIATE_DEFENSIVE_FREEZE_AND_ALERT");
        assert_eq!(aob.flehmen_history_count, 1);
        assert_eq!(aob.active_signals.len(), 1);

        let weak_trail = PheromoneSignal::new("agent-beta", "workspace/db", PheromoneType::Trail, 0.05);
        let resp_weak = aob.receive_signal(weak_trail);
        assert!(!resp_weak.triggered);
        assert_eq!(resp_weak.autonomic_action, "SUBLIMINAL_UNDETECTED");
    }

    #[test]
    fn test_pheromone_decay() {
        let mut aob = AccessoryOlfactoryBulb::new(0.1);
        let trail = PheromoneSignal::new("agent-alpha", "workspace/cache", PheromoneType::Trail, 0.5);
        aob.receive_signal(trail);
        assert_eq!(aob.active_signals.len(), 1);

        aob.decay_pheromones(1000.0);
        assert_eq!(aob.active_signals.len(), 0);
    }
}
