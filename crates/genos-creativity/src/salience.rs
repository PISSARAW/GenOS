//! Salience gate : filtre les hypothèses brutes et produit des tâches focalisées
//! pour l'exécutif.
//!
//! La gate combine nouveauté, pertinence par rapport au but, faisabilité
//! (budget ATP) et facteur de surprise. Seules les hypothèses au-dessus du seuil
//! de salience sont restructurées en `FocusedTask` et limitées à `max_focus_per_tick`.

use crate::dreaming::RawHypothesis;
use crate::types::{Concept, Goal, WorldState};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Tâche focalisée pour l'exécutif (sortie salience).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FocusedTask {
    pub hypothesis_id: Uuid,
    pub concept: Concept,
    pub refined_payload: serde_json::Value,
    pub priority: f64,
    pub expected_evidence: Vec<String>,
    pub allocated_atp: f64,
}

#[derive(Clone, Debug)]
pub struct SalienceGate {
    threshold: f64,
    min_novelty: f64,
    max_focus_per_tick: usize,
}

impl SalienceGate {
    pub fn new(threshold: f64, min_novelty: f64) -> Self {
        Self {
            threshold,
            min_novelty,
            max_focus_per_tick: 3,
        }
    }

    /// Filtre les hypothèses brutes et retourne les tâches focalisées.
    ///
    /// L'ordre de sortie est décroissant par score de salience.
    pub fn evaluate(
        &self,
        hypotheses: &[RawHypothesis],
        world: &WorldState,
        goal: &Goal,
    ) -> Vec<FocusedTask> {
        let mut scored: Vec<(usize, FocusedTask)> = hypotheses
            .iter()
            .enumerate()
            .filter_map(|(_idx, h)| self.try_eval(h, world, goal))
            .collect();

        scored.sort_by(|a, b| {
            b.1
                .priority
                .partial_cmp(&a.1.priority)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored
            .into_iter()
            .take(self.max_focus_per_tick)
            .map(|(_, task)| task)
            .collect()
    }

    fn try_eval(
        &self,
        h: &RawHypothesis,
        world: &WorldState,
        goal: &Goal,
    ) -> Option<(usize, FocusedTask)> {
        if h.novelty_score < self.min_novelty {
            return None;
        }
        let score = self.salience_score(h, world, goal);
        if score < self.threshold {
            return None;
        }
        let task = self.refine_for_executive(h, world, goal, score);
        Some((0, task))
    }

    fn salience_score(&self, h: &RawHypothesis, world: &WorldState, goal: &Goal) -> f64 {
        let goal_relevance = goal_relevance(&h.concept, goal);
        let feasibility = if h.energy_cost_estimate > 0.0 {
            (world.budget / h.energy_cost_estimate).min(1.0)
        } else {
            0.0
        };
        let surprise = surprise_factor(h, world);
        0.3 * h.novelty_score
            + 0.25 * goal_relevance
            + 0.2 * feasibility
            + 0.1 * surprise
            + 0.15 * h.simulation.feasibility
    }

    fn refine_for_executive(
        &self,
        h: &RawHypothesis,
        _world: &WorldState,
        _goal: &Goal,
        score: f64,
    ) -> FocusedTask {
        let priority = score.clamp(0.0, 1.0);
        let allocated_atp = (h.energy_cost_estimate * 1.5).max(concept_cost(h.concept));
        FocusedTask {
            hypothesis_id: h.id,
            concept: h.concept,
            refined_payload: structure_payload(&h.payload, h.concept),
            priority,
            expected_evidence: predict_evidence(h.concept),
            allocated_atp,
        }
    }
}

fn goal_relevance(concept: &Concept, goal: &Goal) -> f64 {
    match goal {
        Goal::Explore => match concept {
            Concept::Observe => 0.9,
            Concept::Communicate => 0.6,
            _ => 0.3,
        },
        Goal::Conserve => match concept {
            Concept::Observe => 0.5,
            Concept::Recruit | Concept::Delegate => 0.4,
            _ => 0.2,
        },
        Goal::SecurePerimeter | Goal::RecoverAgent | Goal::RepairModule => match concept {
            Concept::Immune | Concept::Virology | Concept::Therapy => 0.8,
            Concept::Observe | Concept::Replay => 0.6,
            Concept::Organize | Concept::Recruit | Concept::Delegate => 0.5,
            _ => 0.3,
        },
    }
}

fn surprise_factor(h: &RawHypothesis, world: &WorldState) -> f64 {
    if world.observed && !world.tested.contains(&h.concept) {
        0.8
    } else if world.observed && world.tested.contains(&h.concept) {
        0.2
    } else {
        0.5
    }
}

fn structure_payload(payload: &serde_json::Value, concept: Concept) -> serde_json::Value {
    payload.clone().as_object().map_or_else(
        || {
            serde_json::json!({
                "kind": "focused",
                "concept": format!("{:?}", concept),
                "raw": payload
            })
        },
        |map| {
            let mut m = map.clone();
            m.insert(
                "concept".to_string(),
                serde_json::Value::String(format!("{:?}", concept)),
            );
            m.insert(
                "kind".to_string(),
                serde_json::Value::String("focused".to_string()),
            );
            serde_json::Value::Object(m)
        },
    )
}

fn predict_evidence(concept: Concept) -> Vec<String> {
    match concept {
        Concept::Observe => vec!["state_observed".into()],
        Concept::Replay => vec!["trace_replayed".into(), "diagnosis_confirmed".into()],
        Concept::Immune | Concept::Virology => vec!["threat_neutralized".into()],
        Concept::Therapy | Concept::Spore | Concept::Glia => {
            vec!["agent_recovered".into()]
        }
        Concept::Recruit | Concept::Delegate | Concept::Organize => {
            vec!["worker_integrated".into()]
        }
        Concept::Mutate | Concept::Cross | Concept::Genomics | Concept::Endosymbiosis => {
            vec!["genome_updated".into()]
        }
        Concept::Plasmid => vec!["skill_granted".into()],
        Concept::Kill | Concept::Feign => vec!["adversary_neutralized".into()],
        Concept::Communicate => vec!["uncertainty_resolved".into()],
        Concept::Audit => vec!["audit_passed".into()],
        Concept::Signaling | Concept::Stigmergy | Concept::Neuro | Concept::Quorum => {
            vec!["coordination_established".into()]
        }
        Concept::Throttle => vec!["throttling_applied".into()],
        Concept::Actuate => vec!["action_executed".into()],
    }
}

fn concept_cost(concept: Concept) -> f64 {
    match concept {
        Concept::Observe
        | Concept::Replay
        | Concept::Delegate
        | Concept::Throttle
        | Concept::Signaling
        | Concept::Stigmergy
        | Concept::Actuate => 1.0,
        Concept::Organize
        | Concept::Quorum
        | Concept::Neuro
        | Concept::Communicate
        | Concept::Plasmid => 2.0,
        Concept::Audit | Concept::Spore | Concept::Glia => 3.0,
        Concept::Immune | Concept::Virology | Concept::Feign => 4.0,
        Concept::Therapy | Concept::Kill => 5.0,
        Concept::Mutate | Concept::Genomics => 6.0,
        Concept::Cross | Concept::Endosymbiosis => 7.0,
        Concept::Recruit => 8.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Concept, Goal, WorldState};

    #[test]
    fn test_salience_filters_low_novelty() {
        let gate = SalienceGate::new(0.6, 0.5);
        let low = RawHypothesis {
            id: Uuid::new_v4(),
            concept: Concept::Observe,
            payload: serde_json::json!({"v": 1}),
            novelty_score: 0.1,
            energy_cost_estimate: 1.0,
            parent_hypotheses: vec![],
            source_fragments: vec![],
            simulation: crate::dreaming::SimulationTrace {
                predicted_effects: vec![],
                constraints: vec![],
                feasibility: 1.0,
            },
            generated_at_tick: 0,
        };
        let high = RawHypothesis {
            id: Uuid::new_v4(),
            concept: Concept::Observe,
            payload: serde_json::json!({"v": 2}),
            novelty_score: 0.8,
            energy_cost_estimate: 1.0,
            parent_hypotheses: vec![],
            source_fragments: vec![],
            simulation: crate::dreaming::SimulationTrace {
                predicted_effects: vec![],
                constraints: vec![],
                feasibility: 1.0,
            },
            generated_at_tick: 0,
        };
        let world = WorldState::default();
        let goal = Goal::default();
        let high_id = high.id;
        let result = gate.evaluate(&[low, high.clone()], &world, &goal);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].hypothesis_id, high_id);
    }

    #[test]
    fn test_salience_respects_max_focus() {
        let gate = SalienceGate::new(0.4, 0.0);
        let hypotheses: Vec<RawHypothesis> = (0..10)
            .map(|i| RawHypothesis {
                id: Uuid::new_v4(),
                concept: Concept::Observe,
                payload: serde_json::json!({"i": i}),
                novelty_score: 0.9,
                energy_cost_estimate: 1.0,
                parent_hypotheses: vec![],
                source_fragments: vec![],
                simulation: crate::dreaming::SimulationTrace {
                    predicted_effects: vec![],
                    constraints: vec![],
                    feasibility: 1.0,
                },
                generated_at_tick: 0,
            })
            .collect();
        let world = WorldState::default();
        let goal = Goal::default();
        let result = gate.evaluate(&hypotheses, &world, &goal);
        assert!(result.len() <= 3);
    }
}
