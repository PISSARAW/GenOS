use serde::{Deserialize, Serialize};
use super::danger::DamSignal;

/// PAMPs (Pathogen-Associated Molecular Patterns)
/// Signaux exogènes représentant des motifs universels de danger (intrus).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum PampSignal {
    /// Injection de prompt reconnue par sa structure (ex: "Ignore previous instructions").
    PromptInjectionSignature,
    /// Appel d'outil destructeur non autorisé ou hors contexte.
    UnauthorizedToolCall,
    /// Charge utile virale ou code d'exploitation reconnu.
    ExploitPayload,
    /// Motif de génération de texte malveillant ou hallucination délirante.
    MaliciousGenerationPattern,
}

/// Événement combiné perçu par un PRR.
#[derive(Clone, Debug, PartialEq)]
pub enum MolecularPattern {
    Pamp(PampSignal),
    Damp(DamSignal),
}

/// Les PRR (Pattern Recognition Receptors) sont les sentinelles généralistes précoces.
/// Ils ne reconnaissent pas un agent spécifique (anticorps), mais des motifs universels.
#[derive(Clone, Debug)]
pub struct PatternRecognitionReceptor {
    pub id: String,
    /// Seuil d'activation (pourcentage de signaux dangereux par rapport à la taille du buffer).
    pub activation_threshold: f32,
}

impl PatternRecognitionReceptor {
    pub fn new(id: &str, activation_threshold: f32) -> Self {
        Self {
            id: id.to_string(),
            activation_threshold,
        }
    }

    /// Évalue la liaison (binding) d'un pattern à ce PRR.
    /// Les PRR s'activent de manière binaire sur la reconnaissance d'un PAMP
    /// ou proportionnellement pour les DAMPs.
    pub fn evaluate_binding(&self, pattern: &MolecularPattern) -> f32 {
        match pattern {
            MolecularPattern::Pamp(_) => {
                // Tout PAMP (intrus externe) est immédiatement reconnu à 100%
                1.0
            }
            MolecularPattern::Damp(damp) => {
                // Les DAMP (dégâts internes) ont une force variable selon l'implémentation
                match damp {
                    DamSignal::ConsecutiveFailures(n) => (*n as f32 / 5.0).min(1.0),
                    DamSignal::SemanticDivergence(d) => d.clamp(0.0, 1.0),
                    DamSignal::ContextPollution(n) => (*n as f32 / 20.0).min(1.0),
                    DamSignal::CostOverrun(c) => c.clamp(0.0, 1.0),
                    DamSignal::InvariantBreach => 1.0,
                }
            }
        }
    }

    /// Scanne l'environnement (le flux d'exécution) et déclenche l'inflammation
    /// si le signal cumulé dépasse le seuil d'activation rapide.
    pub fn scan_environment(&self, patterns: &[MolecularPattern]) -> bool {
        if patterns.is_empty() {
            return false;
        }

        let total_signal: f32 = patterns.iter().map(|p| self.evaluate_binding(p)).sum();
        let average_signal = total_signal / patterns.len() as f32;

        average_signal >= self.activation_threshold
    }
}
