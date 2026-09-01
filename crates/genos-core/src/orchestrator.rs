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
        if agent.mitochondria.atp_budget == 0 {
            return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }

        // 2. Vérification biologique (Épigénétique)
        // L'apoptose est la "mort cellulaire programmée" en biologie si la cellule dérive.
        if let Some(rule) = &self.apoptosis_rule {
            if rule.evaluate(&agent.cytoplasm.cognition.epigenetic_drives) {
                return TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string());
            }
        }

        // 3. Inscription dans le phénotype comportemental (Trace)
        // C'est ici que le LLM serait appelé dans le vrai système.
        agent.cytoplasm.trace.sequence.push(action_string.to_string());

        // 4. Mise à jour des coûts
        agent.mitochondria.atp_budget =
            agent.mitochondria.atp_budget.saturating_sub(1);

        TickResult::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::{
        AgentCell, Cytoplasm, CognitiveState, ActionTrace, EndoplasmicReticulum,
        GolgiApparatus, Lysosomes, Mitochondria, Nucleus, PlasmaMembrane, Genome
    };
    use chrono::Utc;
    use std::collections::HashMap;
    use uuid::Uuid;

    fn mock_cell() -> AgentCell {
        AgentCell {
            cell_id: Uuid::new_v4(),
            plasma_membrane: PlasmaMembrane {
                incoming_receptors: vec![],
                outgoing_ion_channels: vec![],
            },
            nucleus: Nucleus {
                genome: Genome::new("You are a test cell"),
            },
            mitochondria: Mitochondria {
                atp_budget: 10,
                metabolic_rate: 1.0,
            },
            endoplasmic_reticulum: EndoplasmicReticulum {
                active_ribosomes_count: 0,
            },
            golgi_apparatus: GolgiApparatus {
                export_vesicles: vec![],
            },
            lysosomes: Lysosomes {
                digestive_enzymes_active: false,
            },
            cytoplasm: Cytoplasm {
                cognition: CognitiveState {
                    epigenetic_drives: HashMap::new(),
                    working_memory: vec![],
                    episodic_memory: vec![],
                    semantic_memory: vec![],
                },
                trace: ActionTrace::default(),
                active_plasmids: vec![],
            },
        }
    }

    #[test]
    fn test_tick_and_budget() {
        let orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();

        let r1 = orchestrator.tick(&mut cell, "read");
        let r2 = orchestrator.tick(&mut cell, "write");
        let r3 = orchestrator.tick(&mut cell, "think");

        assert!(matches!(r1, TickResult::Continue));
        assert!(matches!(r2, TickResult::Continue));
        assert!(matches!(r3, TickResult::Continue));

        assert_eq!(cell.cytoplasm.trace.sequence.len(), 3);
        assert_eq!(cell.cytoplasm.trace.sequence[0], "read");
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
        cell.cytoplasm.cognition.epigenetic_drives.insert("stress".to_string(), 1.5);

        let result = orchestrator.tick(&mut cell, "panik");

        assert_eq!(
            result,
            TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string())
        );
        assert_eq!(cell.cytoplasm.trace.sequence.len(), 0);
    }

    #[test]
    fn test_cellular_mitosis() {
        let mut mother_cell = mock_cell();
        let mother_atp_initial = mother_cell.mitochondria.atp_budget; // 10
        let mother_id_initial = mother_cell.cell_id;

        // On déclenche la mitose (Le move consomme la mère)
        let (daughter_a, daughter_b) = mother_cell.mitosis().expect("Mitosis failed");

        // Cytocinèse réussie : Deux nouvelles entités physiques
        assert_ne!(daughter_a.cell_id, mother_id_initial);
        assert_ne!(daughter_b.cell_id, mother_id_initial);
        assert_ne!(daughter_a.cell_id, daughter_b.cell_id);

        // Anaphase réussie : L'énergie a été divisée en deux
        assert_eq!(daughter_a.mitochondria.atp_budget, mother_atp_initial / 2);
        assert_eq!(daughter_b.mitochondria.atp_budget, mother_atp_initial / 2);

        // L'ADN est le même
        assert_eq!(daughter_a.nucleus.genome.hash_library(), daughter_b.nucleus.genome.hash_library());
    }
}
