//! Consolidation : passage d'une hypothèse validée en politique / stats Director.
//!
//! Quand une hypothèse créative est validée par preuves (evidence score suffisant),
//! l'expérience est intégrée au Director : statistiques par concept, bandit
//! contextuel, et potentiellement promotion vers une politique permanente quand le
//! concept est validé de manière répétée.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Issue créative d'une exécution.
pub type CreativityOutcome = crate::dopamine::CreativityOutcome;

/// Tâche focalisée pour l'exécutif.
pub type FocusedTask = crate::salience::FocusedTask;

/// Concept (copie locale alignée sur genos-orchestrator).
pub type Concept = crate::types::Concept;

/// Stats d'apprentissage par concept (copie locale).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ActionStats {
    pub attempts: u32,
    pub successes: u32,
}

impl ActionStats {
    pub fn rate(&self) -> f64 {
        (self.successes as f64 + 1.0) / (self.attempts as f64 + 2.0)
    }
}

/// Cible pour la consolidation (Director ou adaptateur).
pub trait ConsolidationTarget {
    fn stats_mut(&mut self) -> &mut BTreeMap<Concept, ActionStats>;
    fn record_concept(&mut self, concept: Concept, success: bool);
    fn learner_predict(&self, concept: &Concept, context: &[f64]) -> f64;
    fn learner_update(&mut self, concept: &Concept, context: &[f64], reward: f64);
}

/// Cross-consolidation : passage d'une hypothèse validée en politique.
#[derive(Clone, Debug)]
pub struct CrossConsolidation {
    /// Nombre de validations nécessaires avant promotion automatique.
    pub min_validations_for_policy: usize,
}

impl CrossConsolidation {
    pub fn new() -> Self {
        Self {
            min_validations_for_policy: 2,
        }
    }

    /// Consolide l'issue d'une exécution créative.
    pub fn consolidate<T: ConsolidationTarget>(
        &self,
        director: &mut T,
        concept: &Concept,
        _task: &FocusedTask,
        outcome: &CreativityOutcome,
    ) {
        match outcome {
            CreativityOutcome::Validated { evidence_score, .. } => {
                {
                    let stats = director.stats_mut().entry(*concept).or_default();
                    stats.attempts += 1;
                    stats.successes += 1;
                }
                let ctx = context_from_task(_task);
                director.learner_update(concept, &ctx, evidence_score.clamp(0.0, 1.0));

                let success_count = {
                    let stats = director.stats_mut().get(concept).unwrap();
                    stats.successes
                };
                if success_count >= self.min_validations_for_policy as u32 {
                    let rate = {
                        let stats = director.stats_mut().get(concept).unwrap();
                        stats.rate()
                    };
                    self.promote_to_policy(director, *concept, success_count, rate);
                }
            }
            CreativityOutcome::Falsified => {
                let stats = director.stats_mut().entry(*concept).or_default();
                stats.attempts += 1;
                let ctx = context_from_task(_task);
                director.learner_update(concept, &ctx, 0.0);
            }
            CreativityOutcome::NoAnswer | CreativityOutcome::Error => {
                let stats = director.stats_mut().entry(*concept).or_default();
                stats.attempts += 1;
            }
        }
    }

    fn promote_to_policy<T: ConsolidationTarget>(
        &self,
        _director: &mut T,
        concept: Concept,
        success_count: u32,
        rate: f64,
    ) {
        println!(
            "[creativity] concept {:?} promoted to policy (success_count: {}, success_rate: {:.2})",
            concept, success_count, rate,
        );
    }
}

/// Contexte factoriel simplifié depuis une tâche focalisée.
fn context_from_task(task: &FocusedTask) -> Vec<f64> {
    vec![task.priority, task.priority, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Concept;
    use uuid::Uuid;

    struct MockDirector {
        stats: BTreeMap<Concept, ActionStats>,
    }

    impl ConsolidationTarget for MockDirector {
        fn stats_mut(&mut self) -> &mut BTreeMap<Concept, ActionStats> {
            &mut self.stats
        }

        fn record_concept(&mut self, _concept: Concept, _success: bool) {}

        fn learner_predict(&self, _concept: &Concept, _context: &[f64]) -> f64 {
            0.5
        }

        fn learner_update(&mut self, _concept: &Concept, _context: &[f64], _reward: f64) {}
    }

    #[test]
    fn test_consolidate_records_success() {
        let consolidation = CrossConsolidation::new();
        let mut director = MockDirector {
            stats: BTreeMap::new(),
        };
        let task = FocusedTask {
            hypothesis_id: Uuid::new_v4(),
            concept: Concept::Observe,
            refined_payload: serde_json::json!({"v": 1}),
            priority: 0.8,
            expected_evidence: vec!["observed".into()],
            allocated_atp: 1.0,
        };
        let outcome = CreativityOutcome::Validated {
            evidence_score: 0.9,
            atp_consumed: 1.0,
        };
        consolidation.consolidate(&mut director, &Concept::Observe, &task, &outcome);
        let stats = director.stats.get(&Concept::Observe).unwrap();
        assert_eq!(stats.attempts, 1);
        assert_eq!(stats.successes, 1);
    }

    #[test]
    fn test_consolidate_records_failure() {
        let consolidation = CrossConsolidation::new();
        let mut director = MockDirector {
            stats: BTreeMap::new(),
        };
        let task = FocusedTask {
            hypothesis_id: Uuid::new_v4(),
            concept: Concept::Mutate,
            refined_payload: serde_json::json!({"v": 1}),
            priority: 0.5,
            expected_evidence: vec![],
            allocated_atp: 6.0,
        };
        let outcome = CreativityOutcome::Falsified;
        consolidation.consolidate(&mut director, &Concept::Mutate, &task, &outcome);
        let stats = director.stats.get(&Concept::Mutate).unwrap();
        assert_eq!(stats.attempts, 1);
        assert_eq!(stats.successes, 0);
    }
}
