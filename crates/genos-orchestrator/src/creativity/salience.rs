use crate::creativity::dreaming::RawHypothesis;
use crate::planner::{WorldState, Concept, Goal};
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Tâche focalisée pour l'Exécutif (sortie Salience)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FocusedTask {
    pub hypothesis_id: Uuid,
    pub concept: Concept,
    pub refined_payload: Value,
    pub priority: f64,
    pub expected_evidence: Vec<String>,
    pub allocated_atp: f64,
    pub metadata: HashMap<String, Value>,
}

pub struct SalienceGate {
    threshold: f64,
    min_novelty: f64,
    max_focus_per_tick: usize,
    goal_weight: f64,
    novelty_weight: f64,
    feasibility_weight: f64,
    surprise_weight: f64,
}

impl SalienceGate {
    pub fn new(threshold: f64, min_novelty: f64) -> Self {
        Self {
            threshold,
            min_novelty,
            max_focus_per_tick: 3,
            goal_weight: 0.3,
            novelty_weight: 0.4,
            feasibility_weight: 0.2,
            surprise_weight: 0.1,
        }
    }

    pub fn with_weights(mut self, goal: f64, novelty: f64, feasibility: f64, surprise: f64) -> Self {
        self.goal_weight = goal;
        self.novelty_weight = novelty;
        self.feasibility_weight = feasibility;
        self.surprise_weight = surprise;
        self
    }

    pub fn set_max_focus(&mut self, max: usize) {
        self.max_focus_per_tick = max;
    }

    /// Filtre hypothèses brutes → tâches focalisées
    pub fn evaluate(&self, hypotheses: &[RawHypothesis], world: &WorldState, goal: &Goal) -> Vec<FocusedTask> {
        hypotheses.iter()
            .filter(|h| h.novelty_score >= self.min_novelty)
            .filter_map(|h| {
                let score = self.salience_score(h, world, goal);
                if score >= self.threshold {
                    Some(self.refine_for_executive(h, world, goal, score))
                } else {
                    None
                }
            })
            .take(self.max_focus_per_tick)
            .collect()
    }

    fn salience_score(&self, h: &RawHypothesis, world: &WorldState, goal: &Goal) -> f64 {
        let goal_relevance = self.goal_relevance(&h.concept, goal, world);
        let feasibility = self.feasibility(h, world);
        let surprise = self.surprise_factor(h, world);

        self.novelty_weight * h.novelty_score
            + self.goal_weight * goal_relevance
            + self.feasibility_weight * feasibility
            + self.surprise_weight * surprise
    }

    fn goal_relevance(&self, concept: &Concept, goal: &Goal, world: &WorldState) -> f64 {
        let goal_progress = world.progress(goal);

        match concept {
            Concept::Observe if goal_progress < 0.3 => 0.9,
            Concept::Mutate | Concept::Cross if goal_progress > 0.5 => 0.8,
            Concept::Organize | Concept::Recruit if world.threat > 0.5 => 0.7,
            Concept::Delegate if world.workers < 3 => 0.6,
            _ => 0.5,
        }
    }

    fn feasibility(&self, h: &RawHypothesis, world: &WorldState) -> f64 {
        let budget_ratio = world.budget / h.energy_cost_estimate.max(1.0);
        let agent_capacity = ((world.required_workers.saturating_sub(world.workers)) as f64 / 10.0).min(1.0);
        (budget_ratio.min(1.0) * 0.7 + agent_capacity * 0.3).clamp(0.0, 1.0)
    }

    fn surprise_factor(&self, h: &RawHypothesis, world: &WorldState) -> f64 {
        let threat_surprise = if world.threat > 0.7 { 0.8 } else { 0.2 };
        let novelty_surprise = h.novelty_score;
        (threat_surprise + novelty_surprise) / 2.0
    }

    fn refine_for_executive(&self, h: &RawHypothesis, world: &WorldState, goal: &Goal, score: f64) -> FocusedTask {
        let mut refined = h.payload.clone();

        if let Value::Object(ref mut map) = refined {
            map.insert("salience_score".to_string(), serde_json::json!(score));
            map.insert("goal_progress".to_string(), serde_json::json!(world.progress(goal)));
            map.insert("budget_available".to_string(), serde_json::json!(world.budget));
            map.insert("execution_mode".to_string(), serde_json::json!("focused"));
        }

        FocusedTask {
            hypothesis_id: h.id,
            concept: h.concept,
            refined_payload: refined,
            priority: score,
            expected_evidence: self.predict_evidence(&h.concept),
            allocated_atp: h.energy_cost_estimate * 1.5,
            metadata: HashMap::new(),
        }
    }

    fn predict_evidence(&self, concept: &Concept) -> Vec<String> {
        match concept {
            Concept::Mutate => vec!["genome_diff".to_string(), "fitness_delta".to_string()],
            Concept::Cross => vec!["child_genome".to_string(), "lineage_record".to_string()],
            Concept::Organize => vec!["topology_map".to_string(), "coordination_metrics".to_string()],
            Concept::Delegate => vec!["task_receipt".to_string(), "completion_proof".to_string()],
            Concept::Recruit => vec!["agent_manifest".to_string(), "capability_proof".to_string()],
            Concept::Observe => vec!["world_state_snapshot".to_string()],
            _ => vec!["execution_trace".to_string()],
        }
    }
}