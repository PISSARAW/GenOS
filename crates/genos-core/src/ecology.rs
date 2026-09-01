use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 4. LA PUNITION ALTRUISTE ET LA RÉPUTATION (Surveillance par les Pairs)
/// Registre public de confiance. Si un Agent B valide un mauvais travail,
/// un Agent C (ou la réalité) baisse sa réputation. À 0, l'Agent est ignoré ou détruit.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ReputationLedger {
    pub trust_scores: HashMap<String, f32>,
}

impl ReputationLedger {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn penalize_collusion(&mut self, agent_id: &str, penalty: f32) {
        let score = self.trust_scores.entry(agent_id.to_string()).or_insert(1.0);
        *score = (*score - penalty).max(0.0);
    }
    
    pub fn is_trusted(&self, agent_id: &str) -> bool {
        *self.trust_scores.get(agent_id).unwrap_or(&1.0) > 0.3 // Seuil de tolérance
    }
}

/// 3. LA SIGNALISATION COÛTEUSE (Handicap de Zahavi)
/// Une validation n'a de valeur que si elle coûte de l'énergie (Tokens LLM / Temps Compute).
/// Empêche un agent Critique de générer le token "OK" sans "réfléchir" pour économiser ses cycles.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CostlySignaling {
    pub minimum_atp_required: u32,
}

impl CostlySignaling {
    pub fn evaluate_signal(&self, consumed_tokens: u32) -> Result<(), String> {
        if consumed_tokens < self.minimum_atp_required {
            return Err(format!("❌ [SIGNAL TROMPEUR] Le signal d'évaluation est trop peu cher ({} tokens, Min: {}). Validation rejetée (Collusion suspectée).", consumed_tokens, self.minimum_atp_required));
        }
        Ok(())
    }
}

/// 2. LA DYNAMIQUE DE LA REINE ROUGE (Course aux Armements Évolutive)
/// Deux agents sont liés par une fonction de survie asymétrique (Zéro-Sum).
/// Impossible de colluder, la survie de l'un implique la destruction de l'autre.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RedQueenDynamics {
    pub predator_id: String,
    pub prey_id: String,
}

impl RedQueenDynamics {
    pub fn resolve_competition(&self, predator_wins: bool) -> String {
        if predator_wins {
            format!("💀 [REINE ROUGE] Le prédateur {} a triomphé. La proie {} subit l'Apoptose.", self.predator_id, self.prey_id)
        } else {
            format!("💀 [REINE ROUGE] La proie {} a survécu. Le prédateur {} meurt d'inanition.", self.prey_id, self.predator_id)
        }
    }
}

/// 1. L'ARBITRAGE DE LA RÉALITÉ (Thermodynamique Infalsifiable)
/// Juge environnemental pur. Les agents ne s'évaluent pas entre eux pour la note finale.
/// Le compilateur, les tests unitaires ou l'environnement physique rendent le seul verdict légitime.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EnvironmentArbiter;

impl EnvironmentArbiter {
    pub fn arbitrate_reality(&self, physical_test_passed: bool) -> Result<String, String> {
        if physical_test_passed {
            Ok("🌍 [RÉALITÉ] Le code compile. Le barrage tient bon. Les agents survivent.".to_string())
        } else {
            Err("💥 [RÉALITÉ] Le code ne compile pas. L'évaluation biaisée du LLM est écrasée. L'environnement sanctionne.".to_string())
        }
    }
}

/// ÉCOLOGIE GLOBALE DU TISSU (Anti-Collusion Multi-Agents)
/// Force les agents d'un Tissue à rester honnêtes et performants.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvolutionaryEcology {
    pub reputation: ReputationLedger,
    pub costly_signaling: CostlySignaling,
    pub red_queen: Option<RedQueenDynamics>,
    pub reality_arbiter: EnvironmentArbiter,
}

impl Default for EvolutionaryEcology {
    fn default() -> Self {
        Self {
            reputation: ReputationLedger::new(),
            costly_signaling: CostlySignaling { minimum_atp_required: 500 }, // Une vraie analyse critique prend au moins 500 tokens
            red_queen: None,
            reality_arbiter: EnvironmentArbiter,
        }
    }
}

impl EvolutionaryEcology {
    pub fn new() -> Self {
        Self::default()
    }

    /// Applique les lois de l'évolution pour contrer la loi de Goodhart et la collusion
    pub fn enforce_anti_collusion(&mut self, agent_id: &str, consumed_tokens: u32, physical_test_passed: bool) -> Result<String, String> {
        // 1. Punition Altruiste / Réputation (Les parias sociaux sont ignorés)
        if !self.reputation.is_trusted(agent_id) {
            return Err(format!("⚖️ [RÉPUTATION] L'Agent '{}' a une confiance trop basse (<30%). Ses évaluations sont rejetées par la ruche.", agent_id));
        }

        // 2. Signalisation Coûteuse (Handicap de Zahavi)
        self.costly_signaling.evaluate_signal(consumed_tokens)?;

        // 3. L'Arbitrage de la Réalité
        let reality_verdict = self.reality_arbiter.arbitrate_reality(physical_test_passed);
        
        // Si l'agent a "validé" l'action mais que la physique/réalité casse, l'agent perd massivement sa réputation
        if reality_verdict.is_err() {
            self.reputation.penalize_collusion(agent_id, 0.5); // Punition sévère (-50%)
            return Err(format!("{} L'Agent '{}' a colludé ou fait preuve d'incompétence. Réputation détruite.", reality_verdict.unwrap_err(), agent_id));
        }

        Ok("✅ L'Écologie valide la transaction. Survivance assurée.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evolutionary_ecology_anti_collusion() {
        let mut ecology = EvolutionaryEcology::new();
        
        // 1. Collusion tacite (Le critique dit que c'est bien, mais ça ne lui a coûté que 50 tokens)
        let cheap_signal = ecology.enforce_anti_collusion("Critique_Agent", 50, true);
        assert!(cheap_signal.is_err());
        assert!(cheap_signal.unwrap_err().contains("SIGNAL TROMPEUR"));

        // 2. Évaluation coûteuse (600 tokens) MAIS la réalité échoue (Code ne compile pas)
        let reality_crash = ecology.enforce_anti_collusion("Critique_Agent", 600, false);
        assert!(reality_crash.is_err());
        assert!(reality_crash.unwrap_err().contains("RÉALITÉ"));
        
        // La réputation de l'agent Critique_Agent a baissé à cause de la faille ci-dessus (1.0 -> 0.5).
        // Il fait encore une erreur...
        let _ = ecology.enforce_anti_collusion("Critique_Agent", 600, false); // 0.5 -> 0.0

        // 3. L'agent est maintenant un Paria (Réputation à 0)
        let paria_signal = ecology.enforce_anti_collusion("Critique_Agent", 1000, true);
        assert!(paria_signal.is_err());
        assert!(paria_signal.unwrap_err().contains("RÉPUTATION")); // La ruche ne lui fait plus confiance
    }
}