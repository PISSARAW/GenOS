use crate::cell::AgentCell;
use crate::epigenetics::Expression;

/// Résultat d'un cycle (tick) de l'orchestrateur
#[derive(Debug, PartialEq)]
pub enum TickResult {
    /// L'agent continue son évolution normalement
    Continue,
    /// L'agent est interrompu (budget épuisé ou règle épigénétique critique)
    Halted(String),
}

/// L'orchestrateur gère la boucle de vie de la cellule IA (l'Agent).
/// Il évalue les règles biologiques avant d'autoriser l'action mécanique.
pub struct Orchestrator {
    /// Règle d'arrêt globale (ex: "stress >= 0.9")
    pub apoptosis_rule: Option<Expression>,
}

impl Orchestrator {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self { apoptosis_rule }
    }

    /// Avance le temps pour une Cellule IA (un pas de cycle).
    /// Respecte la règle : Max 3 paramètres (self, agent mutable, et l'action)
    pub fn tick(&self, agent: &mut AgentCell, action_string: &str) -> TickResult {
        // 1. Vérification mécanique de la survie (budget)
        if agent.metadata.budget_tokens_remaining == 0 {
            return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }

        // 2. Vérification biologique (Épigénétique)
        // L'apoptose est la "mort cellulaire programmée" en biologie si la cellule dérive.
        if let Some(rule) = &self.apoptosis_rule {
            if rule.evaluate(&agent.cognition.epigenetic_drives) {
                return TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string());
            }
        }

        // 3. Inscription dans le phénotype comportemental (Trace)
        // C'est ici que le LLM serait appelé dans le vrai système.
        agent.trace.sequence.push(action_string.to_string());

        // 4. Mise à jour des coûts
        agent.metadata.budget_tokens_remaining =
            agent.metadata.budget_tokens_remaining.saturating_sub(1);

        TickResult::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::{
        ActionTrace, CognitiveState, EnvironmentContext, Genome, InstanceMetadata, Microbiome,
    };
    use chrono::Utc;
    use std::collections::HashMap;
    use uuid::Uuid;

    fn mock_cell() -> AgentCell {
        AgentCell {
            metadata: InstanceMetadata {
                agent_id: Uuid::new_v4(),
                snapshot_id: Uuid::new_v4(),
                branch_id: Uuid::new_v4(),
                created_at: Utc::now(),
                budget_tokens_remaining: 3,
            },
            environment: EnvironmentContext {
                world_id: Uuid::new_v4(),
                peer_ids: vec![],
                available_tools: vec![],
            },
            genome: Genome::new("You are a test cell"),
            microbiome: Microbiome::default(),
            trace: ActionTrace::default(),
            cognition: CognitiveState {
                epigenetic_drives: HashMap::new(),
                working_memory: vec![],
                episodic_memory: vec![],
                semantic_memory: vec![],
                active_goals: vec![],
            },
        }
    }

    #[test]
    fn test_tick_and_budget() {
        let orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();

        // 3 ticks ok
        assert_eq!(
            orchestrator.tick(&mut cell, "read"),
            TickResult::Continue
        );
        assert_eq!(
            orchestrator.tick(&mut cell, "think"),
            TickResult::Continue
        );
        assert_eq!(
            orchestrator.tick(&mut cell, "write"),
            TickResult::Continue
        );

        // 4ème tick = mort par starvation
        assert_eq!(
            orchestrator.tick(&mut cell, "fail"),
            TickResult::Halted("Budget exhausted (starvation)".to_string())
        );

        // Levenshtein / Trace a bien grandi
        assert_eq!(cell.trace.sequence.len(), 3);
        assert_eq!(cell.trace.sequence[0], "read");
    }

    #[test]
    fn test_apoptosis_rule() {
        use crate::epigenetics::{Expression, Operator};

        let rule = Expression::Condition {
            variable: "stress".to_string(),
            operator: Operator::GreaterOrEqual,
            target_value: 1.0,
        };

        let orchestrator = Orchestrator::new(Some(rule));
        let mut cell = mock_cell();

        // Ajout d'un stress élevé via l'épigénétique
        cell.cognition.epigenetic_drives.insert("stress".to_string(), 1.5);

        // Le tick doit tuer la cellule immédiatement
        assert_eq!(
            orchestrator.tick(&mut cell, "try_to_live"),
            TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string())
        );
        // L'action n'a même pas été inscrite
        assert_eq!(cell.trace.sequence.len(), 0);
    }
}
