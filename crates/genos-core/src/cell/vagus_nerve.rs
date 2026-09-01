use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum VagalState {
    /// Circuit fermé : le métabolisme est normal
    Normal,
    /// Circuit ouvert : la cellule est en stase pour se protéger d'une API défaillante (ex: 429)
    Hibernation,
    /// Circuit mi-ouvert : la cellule se réveille et teste l'environnement
    Awakening,
}

/// Le Nerf Vague (Circuit Breaker Biologique)
/// Protège le métabolisme de la cellule contre les surcharges et pannes externes.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VagusNerve {
    pub state: VagalState,
    pub failures: u32,
    pub max_failures: u32,
    pub hibernating_until: Option<DateTime<Utc>>,
}

impl Default for VagusNerve {
    fn default() -> Self {
        Self {
            state: VagalState::Normal,
            failures: 0,
            max_failures: 3,
            hibernating_until: None,
        }
    }
}

impl VagusNerve {
    pub fn new() -> Self {
        Self::default()
    }

    /// Vérifie si la cellule est autorisée à faire une requête (Check du Circuit Breaker)
    pub fn check_stasis(&mut self) -> Result<(), String> {
        if self.state == VagalState::Hibernation {
            if let Some(time) = self.hibernating_until {
                if Utc::now() >= time {
                    self.state = VagalState::Awakening; // Teste le réveil
                } else {
                    return Err("💤 [Stase Métabolique] La cellule hiberne pour protéger le système (Circuit Ouvert).".to_string());
                }
            }
        }
        Ok(())
    }

    /// Enregistre un échec de l'API (Rate limit 429, Erreur 500)
    pub fn record_failure(&mut self) {
        self.failures += 1;
        if self.failures >= self.max_failures {
            self.state = VagalState::Hibernation;
            self.hibernating_until = Some(Utc::now() + Duration::seconds(30)); // 30s de stase
        }
    }

    /// Enregistre un succès (Ferme le circuit)
    pub fn record_success(&mut self) {
        self.failures = 0;
        self.state = VagalState::Normal;
        self.hibernating_until = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_circuit_breaker_vagal() {
        let mut nerve = VagusNerve::default();
        
        // 3 échecs -> Déclenche la stase
        nerve.record_failure();
        nerve.record_failure();
        nerve.record_failure();

        assert_eq!(nerve.state, VagalState::Hibernation);
        
        // La requête est bloquée
        let err = nerve.check_stasis();
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Stase Métabolique"));
    }
}