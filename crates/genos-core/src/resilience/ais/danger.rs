//! Théorie du danger de Matzinger : signaux DAMP endogènes déclenchant la réponse.

use serde::{Deserialize, Serialize};

/// Signaux de danger endogènes (DAMP — Damage-Associated Molecular Patterns).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum DamSignal {
    /// Nécrose cellulaire : échecs consécutifs de l'agent.
    ConsecutiveFailures(u32),
    /// Divergence sémantique anormale entre trajectoires attendue/observée ([0, 1]).
    SemanticDivergence(f32),
    /// Pollution du contexte (items hors-sujet dans la mémoire de travail).
    ContextPollution(u32),
    /// Dépassement du budget métabolique (coût normalisé [0, 1]).
    CostOverrun(f32),
    /// Violation d'un invariant de sécurité critique.
    InvariantBreach,
}

/// Modèle de danger : la réponse immunitaire est activée par le niveau DAMP cumulé,
/// indépendamment de toute reconnaissance Self/Non-Self.
#[derive(Clone, Debug)]
pub struct DangerModel {
    /// Seuil de danger déclenchant la réponse immunitaire.
    pub damp_threshold: f32,
}

impl DangerModel {
    pub fn new(damp_threshold: f32) -> Self {
        Self { damp_threshold }
    }

    /// Niveau DAMP cumulé normalisé dans [0, 1] (4 signaux saturants au maximum).
    pub fn damp_level(&self, signals: &[DamSignal]) -> f32 {
        let raw: f32 = signals
            .iter()
            .map(|s| match s {
                DamSignal::ConsecutiveFailures(n) => (*n as f32 / 5.0).min(1.0),
                DamSignal::SemanticDivergence(d) => d.clamp(0.0, 1.0),
                DamSignal::ContextPollution(n) => (*n as f32 / 20.0).min(1.0),
                DamSignal::CostOverrun(c) => c.clamp(0.0, 1.0),
                DamSignal::InvariantBreach => 1.0,
            })
            .sum();
        (raw / 4.0).min(1.0)
    }

    /// La réponse immunitaire doit-elle être déclenchée ?
    pub fn immune_response_triggered(&self, signals: &[DamSignal]) -> bool {
        self.damp_level(signals) >= self.damp_threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn danger_model_triggers_on_cumulated_damps_only() {
        let model = DangerModel::new(0.5);
        // Signal isolé faible : pas de réponse.
        assert!(!model.immune_response_triggered(&[DamSignal::ConsecutiveFailures(1)]));
        // Signaux cumulés : réponse immunitaire.
        assert!(model.immune_response_triggered(&[
            DamSignal::ConsecutiveFailures(5),
            DamSignal::SemanticDivergence(0.9),
            DamSignal::ContextPollution(20),
        ]));
        // Violation d'invariant critique : signal maximal isolé.
        assert_eq!(model.damp_level(&[DamSignal::InvariantBreach]), 0.25);
        // Aucun signal : aucun danger.
        assert_eq!(model.damp_level(&[]), 0.0);
    }

    #[test]
    fn damp_level_is_bounded_and_monotonic() {
        let model = DangerModel::new(0.5);
        let few = model.damp_level(&[DamSignal::ConsecutiveFailures(2)]);
        let many = model.damp_level(&[
            DamSignal::ConsecutiveFailures(5),
            DamSignal::ConsecutiveFailures(5),
        ]);
        assert!(many > few);
        // Saturation à 1.0 même avec une avalanche de signaux.
        let avalanche: Vec<DamSignal> = (0..8).map(|_| DamSignal::InvariantBreach).collect();
        assert_eq!(model.damp_level(&avalanche), 1.0);
        assert!(
            (model.damp_level(&[DamSignal::SemanticDivergence(3.0)])
                - model.damp_level(&[DamSignal::SemanticDivergence(1.0)]))
            .abs()
                < 1e-6
        );
    }
}
