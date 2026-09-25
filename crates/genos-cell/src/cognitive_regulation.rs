use serde::{Deserialize, Serialize};

/// L'état de régulation cognitive d'une cellule ou d'un agent.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CognitiveRegulationState {
    pub current_budget: f64,
    pub baseline_budget: f64,
    pub dissonance_level: f64,
    pub eureka_moments: u32,
    pub is_apoptotic: bool,
    pub max_dissonance_threshold: f64,
    pub revision: u64,
    #[serde(default)]
    pub eureka_window_started_at_ms: u64,
    #[serde(default)]
    pub eureka_window_count: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct EvaluationDelta {
    pub penalty: f64,
    pub relief: f64,
    pub budget_cost: f64,
}

impl Default for CognitiveRegulationState {
    fn default() -> Self {
        Self {
            current_budget: 100.0,
            baseline_budget: 100.0,
            dissonance_level: 0.0,
            eureka_moments: 0,
            is_apoptotic: false,
            max_dissonance_threshold: 50.0,
            revision: 0,
            eureka_window_started_at_ms: 0,
            eureka_window_count: 0,
        }
    }
}

impl CognitiveRegulationState {
    pub fn reduce_dissonance(&mut self, amount: f64) {
        if amount.is_finite() && amount > 0.0 {
            self.dissonance_level = (self.dissonance_level - amount).max(0.0);
        }
    }

    /// Transition d'état centralisée : pénalité, soulagement (négatif = pénalité
    /// supplémentaire) et coût métabolique. Source unique de la logique
    /// dissonance / budget / apoptose pour toutes les consommatrices.
    pub fn apply_evaluation(&mut self, delta: EvaluationDelta) -> bool {
        if self.is_apoptotic {
            return false;
        }
        let p = if delta.penalty.is_finite() { delta.penalty.max(0.0) } else { 0.0 };
        let r = if delta.relief.is_finite() { delta.relief } else { 0.0 };
        let c = if delta.budget_cost.is_finite() { delta.budget_cost.max(0.0) } else { 0.0 };
        self.dissonance_level = (self.dissonance_level + p - r).max(0.0);
        self.current_budget = (self.current_budget - c).max(0.0);
        self.revision += 1;

        if self.dissonance_level >= self.max_dissonance_threshold || self.current_budget <= 0.0 {
            self.is_apoptotic = true;
            self.current_budget = 0.0;
            true
        } else {
            false
        }
    }

    /// Accumule de la dissonance et applique un soulagement.
    /// Retourne true si l'apoptose cognitive est déclenchée (dissonance >= seuil ou budget épuisé).
    pub fn accumulate_dissonance(&mut self, penalty: f64, relief: f64) -> bool {
        let r = if relief.is_finite() && relief > 0.0 { relief } else { 0.0 };
        self.apply_evaluation(EvaluationDelta { penalty, relief: r, budget_cost: 1.0 })
    }

    /// Enregistre une illumination Eurêka : divise la dissonance par deux et réapprovisionne le capital cognitif.
    pub fn trigger_eureka(&mut self, evidence_validated: bool) -> bool {
        if self.is_apoptotic || !evidence_validated {
            return false;
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64).unwrap_or(0);
        if self.eureka_window_started_at_ms == 0 || now.saturating_sub(self.eureka_window_started_at_ms) >= 60_000 {
            self.eureka_window_started_at_ms = now;
            self.eureka_window_count = 0;
        }
        if self.eureka_window_count >= 3 {
            return false;
        }
        self.eureka_window_count += 1;
        self.eureka_moments = self.eureka_moments.saturating_add(1);
        self.dissonance_level = (self.dissonance_level / 2.0).max(0.0);
        self.current_budget = (self.current_budget + 50.0).min(self.baseline_budget);
        self.revision += 1;
        true
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
    fn test_cognitive_regulation_state_accumulation_and_apoptosis() {
        let mut reg = CognitiveRegulationState::default();
        assert_eq!(reg.dissonance_level, 0.0);
        assert_eq!(reg.harmony_percentage(), 100);

        let apoptotic = reg.accumulate_dissonance(10.0, 2.0);
        assert!(!apoptotic);
        assert_eq!(reg.dissonance_level, 8.0);
        assert_eq!(reg.revision, 1);
        assert!(!reg.is_apoptotic);

        // Dépasser le seuil (50.0)
        let apoptotic = reg.accumulate_dissonance(45.0, 0.0);
        assert!(apoptotic);
        assert!(reg.is_apoptotic);
        assert_eq!(reg.current_budget, 0.0);
        assert_eq!(reg.harmony_percentage(), 0);
    }

    #[test]
    fn test_cognitive_regulation_state_eureka_relief() {
        let mut reg = CognitiveRegulationState::default();
        reg.accumulate_dissonance(20.0, 0.0);
        assert_eq!(reg.dissonance_level, 20.0);

        assert!(reg.trigger_eureka(true));
        assert_eq!(reg.eureka_moments, 1);
        assert_eq!(reg.dissonance_level, 10.0);
    }

    #[test]
    fn test_eureka_counter_saturates() {
        let mut reg = CognitiveRegulationState {
            eureka_moments: u32::MAX,
            ..Default::default()
        };

        assert!(!reg.trigger_eureka(false));
        reg.trigger_eureka(true);

        assert_eq!(reg.eureka_moments, u32::MAX);
    }
}
