use serde::{Deserialize, Serialize};

/// Mode de mimétisme non visuel
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NonVisualMode {
    ChemicalPheromonal,   // Phéromones de stigmergie
    AcousticUltrasonic,   // Clics ultrasonores & fréquence Kuramoto
}

/// Mimétisme chimique : détournement de gradient d'attraction ou répulsion stigmergique
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChemicalPheromoneMimicry {
    pub simulated_pheromone: String,
    pub concentration_yield: f64,
    pub is_repellent: bool,
}

impl ChemicalPheromoneMimicry {
    pub fn new(pheromone: &str, intensity: f64, is_repellent: bool) -> Self {
        Self {
            simulated_pheromone: pheromone.to_string(),
            concentration_yield: intensity.clamp(0.0, 100.0),
            is_repellent,
        }
    }

    /// Génère le gradient chimique émulé
    pub fn synthesize_gradient(&self) -> String {
        if self.is_repellent {
            format!("[PHEROMONE_REPELLENT_ALARM:{}:{:.1}]", self.simulated_pheromone, self.concentration_yield)
        } else {
            format!("[PHEROMONE_BROOD_ATTRACTANT:{}:{:.1}]", self.simulated_pheromone, self.concentration_yield)
        }
    }
}

/// Mimétisme acoustique / fréquentiel : réaccordage d'oscillateur de Kuramoto et brouillage ultrasonore
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AcousticUltrasonicMimicry {
    pub natural_frequency_hz: f64,
    pub phase_rad: f64,
    pub ultrasonic_jamming_active: bool,
}

impl AcousticUltrasonicMimicry {
    pub fn new(freq_hz: f64) -> Self {
        Self {
            natural_frequency_hz: freq_hz,
            phase_rad: 0.0,
            ultrasonic_jamming_active: false,
        }
    }

    /// Synchronise la phase sur le chorus collectif de l'essaim
    pub fn entrain_phase(&mut self, swarm_target_phase: f64, coupling_strength: f64) -> f64 {
        let phase_diff = swarm_target_phase - self.phase_rad;
        self.phase_rad += coupling_strength * phase_diff.sin();
        self.phase_rad
    }

    /// Déclenche un train de clics ultrasonores pour désamorcer une attaque acoustique ou un orage de boucles
    pub fn trigger_ultrasonic_jamming(&mut self) -> String {
        self.ultrasonic_jamming_active = true;
        format!("[ULTRASONIC_ACOUSTIC_CLICKS:JAMMING_ACTIVE:{}Hz]", self.natural_frequency_hz)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chemical_pheromone_synthesis() {
        let chem = ChemicalPheromoneMimicry::new("TRAIL_OPTIMAL_PATH", 45.0, false);
        let grad = chem.synthesize_gradient();
        assert!(grad.contains("PHEROMONE_BROOD_ATTRACTANT"));
        assert!(grad.contains("45.0"));

        let alarm = ChemicalPheromoneMimicry::new("DEAD_END_BUG", 80.0, true);
        assert!(alarm.synthesize_gradient().contains("PHEROMONE_REPELLENT_ALARM"));
    }

    #[test]
    fn test_acoustic_kuramoto_entrainment_and_jamming() {
        let mut acoustic = AcousticUltrasonicMimicry::new(40000.0); // 40 kHz ultrason
        let new_phase = acoustic.entrain_phase(std::f64::consts::PI / 2.0, 0.5);
        assert!(new_phase > 0.0);

        let jamming = acoustic.trigger_ultrasonic_jamming();
        assert!(jamming.contains("ULTRASONIC_ACOUSTIC_CLICKS"));
        assert!(acoustic.ultrasonic_jamming_active);
    }
}
