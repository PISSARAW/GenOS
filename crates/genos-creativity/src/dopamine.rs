//! Signal dopaminergique : Reward Prediction Error (RPE) appliqué au Director.
//!
//! Le signal calcule l'écart entre récompense attendue et réelle, puis ajuste les
//! paramètres adaptatifs du Director (exploration_weight, stress_cost_weight) pour
//! favoriser l'exploration après des succès inattendus et la prudence après des
//! erreurs inattendues.
//!
//! Ce module utilise des traits pour interagir avec le Director de manière générique,
//! sans dépendance directe vers genos-orchestrator.

use serde::{Deserialize, Serialize};

/// Issue créative d'une exécution (utilisée pour le RPE et la consolidation).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum CreativityOutcome {
    /// Hypothèse validée par preuve d'évidence.
    Validated {
        evidence_score: f64,
        atp_consumed: f64,
    },
    /// Hypothèse falsifiée par contre-exemple ou test échoué.
    Falsified,
    /// Aucune réponse possible dans le domaine borné.
    NoAnswer,
    /// Erreur d'exécution.
    Error,
}

/// Signal dopaminergique = Reward Prediction Error.
#[derive(Clone, Debug)]
pub struct DopamineSignal {
    /// Exploration de base (alignée sur Director::default).
    pub baseline_exploration: f64,
    /// Taux d'apprentissage du RPE.
    pub learning_rate: f64,
    /// Plafond d'exploration.
    pub max_exploration: f64,
    /// Plancher d'exploration.
    pub min_exploration: f64,
}

impl Default for DopamineSignal {
    fn default() -> Self {
        Self::new()
    }
}

impl DopamineSignal {
    pub fn new() -> Self {
        Self {
            baseline_exploration: 1.5,
            learning_rate: 0.01,
            max_exploration: 3.0,
            min_exploration: 0.1,
        }
    }

    /// Applique le RPE au Director (adaptateur générique).
    ///
    /// `expected` et `actual` sont dans [-1, 1] après normalisation.
    pub fn apply<D>(&self, director: &mut D, expected: f64, actual: f64)
    where
        D: DopamineTarget,
    {
        let rpe = (actual - expected).clamp(-1.0, 1.0);

        // Mise à jour exploration_weight (clampée).
        let delta = self.learning_rate * rpe;
        let new_exploration = (director.exploration_weight() + delta)
            .clamp(self.min_exploration, self.max_exploration);
        director.set_exploration_weight(new_exploration);

        // RPE positif fort → baisse stress_cost_weight (plus audacieux).
        if rpe > 0.5 {
            let new_stress = (director.stress_cost_weight() * 0.98).max(0.0);
            director.set_stress_cost_weight(new_stress);
        }

        // RPE négatif fort → hausse du poids du stress (plus prudent).
        if rpe < -0.5 {
            let new_stress = (director.stress_cost_weight() * 1.02).min(4.0);
            director.set_stress_cost_weight(new_stress);
        }
    }

    /// Récompense attendue par défaut (baseline neutre pour v1).
    pub fn expected_default(&self) -> f64 {
        0.3
    }

    /// Récompense réelle depuis l'outcome créatif.
    pub fn actual_reward(&self, outcome: &CreativityOutcome) -> f64 {
        match outcome {
            CreativityOutcome::Validated { evidence_score, .. } => evidence_score.clamp(0.0, 1.0),
            CreativityOutcome::Falsified => -0.5,
            CreativityOutcome::NoAnswer => -0.1,
            CreativityOutcome::Error => -1.0,
        }
    }

    /// Récompense attendue approximative depuis contexte.
    pub fn expected_reward_from_context(&self, _ctx: &[f64]) -> f64 {
        self.expected_default()
    }
}

/// Cible pour l'application du signal dopaminergique.
///
/// Ce trait est implémenté par le Director de genos-orchestrator dans le module
/// d'intégration (pas dans ce crate, pour éviter le cycle de dépendance).
pub trait DopamineTarget {
    fn exploration_weight(&self) -> f64;
    fn set_exploration_weight(&mut self, value: f64);
    fn stress_cost_weight(&self) -> f64;
    fn set_stress_cost_weight(&mut self, value: f64);
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockDirector {
        exploration: f64,
        stress_cost: f64,
    }

    impl DopamineTarget for MockDirector {
        fn exploration_weight(&self) -> f64 {
            self.exploration
        }

        fn set_exploration_weight(&mut self, value: f64) {
            self.exploration = value;
        }

        fn stress_cost_weight(&self) -> f64 {
            self.stress_cost
        }

        fn set_stress_cost_weight(&mut self, value: f64) {
            self.stress_cost = value;
        }
    }

    #[test]
    fn test_dopamine_increases_exploration_on_positive_rpe() {
        let dopamine = DopamineSignal::new();
        let mut director = MockDirector {
            exploration: 1.5,
            stress_cost: 2.0,
        };
        dopamine.apply(&mut director, 0.2, 0.9);
        assert!(
            director.exploration > 1.5,
            "exploration_weight devrait augmenter (RPE positif)"
        );
    }

    #[test]
    fn test_dopamine_decreases_exploration_on_negative_rpe() {
        let dopamine = DopamineSignal::new();
        let mut director = MockDirector {
            exploration: 1.5,
            stress_cost: 2.0,
        };
        dopamine.apply(&mut director, 0.8, -0.5);
        assert!(
            director.exploration < 1.5,
            "exploration_weight devrait baisser (RPE négatif)"
        );
    }

    #[test]
    fn test_actual_reward_mapping() {
        let dopamine = DopamineSignal::new();
        assert!((dopamine
            .actual_reward(&CreativityOutcome::Validated {
                evidence_score: 0.8,
                atp_consumed: 1.0,
            })
            - 0.8)
            .abs()
            < 1e-9);
        assert_eq!(dopamine.actual_reward(&CreativityOutcome::Falsified), -0.5);
        assert_eq!(dopamine.actual_reward(&CreativityOutcome::NoAnswer), -0.1);
        assert_eq!(dopamine.actual_reward(&CreativityOutcome::Error), -1.0);
    }

    #[test]
    fn test_expected_default() {
        let dopamine = DopamineSignal::new();
        assert_eq!(dopamine.expected_default(), 0.3);
    }
}
