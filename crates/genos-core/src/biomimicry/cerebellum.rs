use serde::{Deserialize, Serialize};

/// Représente l'intention (le modèle moteur prévu par le cortex/planificateur).
#[derive(Clone, Debug, PartialEq)]
pub struct CorticalIntention {
    /// Valeur cible ou objectif quantitatif (ex: taux de complétion, position mémoire).
    pub target_value: f64,
    /// Temps estimé par le cortex pour réaliser l'action.
    pub expected_latency_ms: u64,
}

/// Représente le feedback sensoriel de l'action réelle (retour des outils).
#[derive(Clone, Debug, PartialEq)]
pub struct SensoryFeedback {
    /// État ou progression réelle constatée.
    pub current_value: f64,
    /// Temps de latence effectivement mesuré.
    pub actual_latency_ms: u64,
}

/// Correction motrice générée par le cervelet et renvoyée en temps réel.
#[derive(Clone, Debug, PartialEq)]
pub struct MotorCorrection {
    /// Ajustement de force ou de trajectoire à appliquer immédiatement.
    pub adjustment_delta: f64,
    /// Décalage temporel (Δt) : Positif = en retard, Négatif = en avance.
    pub timing_offset_ms: i64,
}

/// Le Cervelet : Système de correction d'erreurs en temps réel.
/// Son rôle n'est pas d'initier le plan (Cortex), mais de surveiller l'écart
/// entre l'Intention et la Réalité pour assurer le "micro-timing".
#[derive(Clone, Debug)]
pub struct CerebellumCoprocessor {
    /// Vitesse à laquelle le cervelet corrige l'erreur spatiale.
    pub learning_rate: f64,
    /// Marge d'erreur tolérée avant d'intervenir.
    pub tolerance_margin: f64,
}

impl CerebellumCoprocessor {
    pub fn new(learning_rate: f64, tolerance_margin: f64) -> Self {
        Self {
            learning_rate,
            tolerance_margin,
        }
    }

    /// Compare l'intention du cortex à la réalité du terrain et calcule l'erreur
    /// temporelle et spatiale pour appliquer une correction immédiate ("Micro-timing").
    pub fn calculate_correction(
        &self,
        intention: &CorticalIntention,
        feedback: &SensoryFeedback,
    ) -> MotorCorrection {
        let value_error = intention.target_value - feedback.current_value;
        let timing_error = feedback.actual_latency_ms as i64 - intention.expected_latency_ms as i64;
        
        let mut adjustment = 0.0;
        if value_error.abs() > self.tolerance_margin {
            // Le cervelet applique une correction fine proportionnelle à l'erreur
            adjustment = value_error * self.learning_rate;
        }

        MotorCorrection {
            adjustment_delta: adjustment,
            timing_offset_ms: timing_error,
        }
    }
}
