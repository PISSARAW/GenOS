use serde::{Deserialize, Serialize};

/// Statut de survie d'un organisme.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum SurvivalStatus {
    Viable,
    Endangered,
    Critical,
}

/// Système de régulation de la survie (homéostasie + réponse au stress).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SurvivalSystem {
    pub homeostasis_setpoint: f64,
    pub current_state: f64,
    pub stress_level: f64,
    pub survival_threshold: f64,
}

impl Default for SurvivalSystem {
    fn default() -> Self {
        Self {
            homeostasis_setpoint: 1.0,
            current_state: 1.0,
            stress_level: 0.0,
            survival_threshold: 0.3,
        }
    }
}

impl SurvivalSystem {
    pub fn new() -> Self {
        Self::default()
    }

    /// Évalue le statut de survie à partir de l'état courant et du stress.
    pub fn assess(&self) -> SurvivalStatus {
        if self.current_state <= self.survival_threshold || self.stress_level >= 1.0 {
            return SurvivalStatus::Critical;
        }
        let deviation = (self.current_state - self.homeostasis_setpoint).abs();
        if deviation > 0.4 || self.stress_level > 0.6 {
            SurvivalStatus::Endangered
        } else {
            SurvivalStatus::Viable
        }
    }

    /// Régule l'état courant vers le point de consigne, en tenant compte du stress.
    pub fn regulate(&mut self, input: f64) -> SurvivalStatus {
        let stress_penalty = self.stress_level * 0.1;
        let delta = (self.homeostasis_setpoint - input).abs() * 0.5 - stress_penalty;
        self.current_state = (self.current_state + delta).clamp(0.0, 1.0);
        self.stress_level = (self.stress_level + delta.abs() * 0.1).clamp(0.0, 1.0);
        self.assess()
    }

    /// Réduit le niveau de stress (récupération).
    pub fn recover(&mut self, amount: f64) {
        self.stress_level = (self.stress_level - amount).clamp(0.0, 1.0);
        if self.current_state < self.homeostasis_setpoint {
            self.current_state = (self.current_state + amount * 0.5).clamp(0.0, 1.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viable_when_near_setpoint_and_low_stress() {
        let system = SurvivalSystem::new();
        assert_eq!(system.assess(), SurvivalStatus::Viable);
    }

    #[test]
    fn critical_when_state_below_threshold() {
        let mut system = SurvivalSystem::new();
        system.current_state = 0.1;
        assert_eq!(system.assess(), SurvivalStatus::Critical);
    }

    #[test]
    fn endangered_when_high_stress() {
        let mut system = SurvivalSystem::new();
        system.stress_level = 0.8;
        assert_eq!(system.assess(), SurvivalStatus::Endangered);
    }

    #[test]
    fn regulate_moves_toward_setpoint() {
        let mut system = SurvivalSystem::new();
        system.current_state = 0.5;
        let _ = system.regulate(0.5);
        assert!(system.current_state > 0.5);
    }

    #[test]
    fn recover_reduces_stress() {
        let mut system = SurvivalSystem::new();
        system.stress_level = 0.8;
        system.recover(0.3);
        assert!((system.stress_level - 0.5).abs() < f64::EPSILON);
    }
}
