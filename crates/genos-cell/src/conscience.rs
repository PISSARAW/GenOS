use serde::{Deserialize, Serialize};

/// L'état de conscience d'une cellule ou d'un agent.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConscienceState {
    pub current_budget: f64,
    pub baseline_budget: f64,
    pub dissonance_level: f64,
    pub eureka_moments: u32,
    pub is_apoptotic: bool,
    pub max_dissonance_threshold: f64,
    pub revision: u64,
}

impl Default for ConscienceState {
    fn default() -> Self {
        Self {
            current_budget: 100.0,
            baseline_budget: 100.0,
            dissonance_level: 0.0,
            eureka_moments: 0,
            is_apoptotic: false,
            max_dissonance_threshold: 50.0,
            revision: 0,
        }
    }
}

impl ConscienceState {
    pub fn reduce_dissonance(&mut self, amount: f64) {
        if amount.is_finite() && amount > 0.0 {
            self.dissonance_level = (self.dissonance_level - amount).max(0.0);
        }
    }

    /// Accumule de la dissonance et applique un soulagement.
    /// Retourne true si l'apoptose cognitive est déclenchée (dissonance >= seuil ou budget épuisé).
    pub fn accumulate_dissonance(&mut self, penalty: f64, relief: f64) -> bool {
        if self.is_apoptotic {
            return false;
        }
        let p = if penalty.is_finite() && penalty > 0.0 { penalty } else { 0.0 };
        let r = if relief.is_finite() && relief > 0.0 { relief } else { 0.0 };
        self.dissonance_level = (self.dissonance_level + p - r).max(0.0);
        self.current_budget = (self.current_budget - 1.0).max(0.0);
        self.revision += 1;

        if self.dissonance_level >= self.max_dissonance_threshold || self.current_budget <= 0.0 {
            self.is_apoptotic = true;
            self.current_budget = 0.0;
            true
        } else {
            false
        }
    }

    /// Enregistre une illumination Eurêka : divise la dissonance par deux et réapprovisionne le capital cognitif.
    pub fn trigger_eureka(&mut self) {
        if self.is_apoptotic {
            return;
        }
        self.eureka_moments += 1;
        self.dissonance_level = (self.dissonance_level / 2.0).max(0.0);
        self.current_budget = (self.current_budget + 50.0).min(self.baseline_budget);
        self.revision += 1;
    }

    /// Pourcentage d'harmonie interne (0 - 100%)
    pub fn harmony_percentage(&self) -> u32 {
        if self.max_dissonance_threshold <= 0.0 {
            return 0;
        }
        let ratio = (self.max_dissonance_threshold - self.dissonance_level) / self.max_dissonance_threshold;
        (ratio.clamp(0.0, 1.0) * 100.0).round() as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conscience_state_accumulation_and_apoptosis() {
        let mut conscience = ConscienceState::default();
        assert_eq!(conscience.dissonance_level, 0.0);
        assert_eq!(conscience.harmony_percentage(), 100);

        let apoptotic = conscience.accumulate_dissonance(10.0, 2.0);
        assert!(!apoptotic);
        assert_eq!(conscience.dissonance_level, 8.0);
        assert_eq!(conscience.revision, 1);
        assert!(!conscience.is_apoptotic);

        // Dépasser le seuil (50.0)
        let apoptotic = conscience.accumulate_dissonance(45.0, 0.0);
        assert!(apoptotic);
        assert!(conscience.is_apoptotic);
        assert_eq!(conscience.current_budget, 0.0);
        assert_eq!(conscience.harmony_percentage(), 0);
    }

    #[test]
    fn test_conscience_state_eureka_relief() {
        let mut conscience = ConscienceState::default();
        conscience.accumulate_dissonance(20.0, 0.0);
        assert_eq!(conscience.dissonance_level, 20.0);

        conscience.trigger_eureka();
        assert_eq!(conscience.eureka_moments, 1);
        assert_eq!(conscience.dissonance_level, 10.0);
    }
}
