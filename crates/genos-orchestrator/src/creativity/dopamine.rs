use crate::director::Director;
use crate::planner::{WorldState, Goal};
use serde::{Deserialize, Serialize};

/// Signal dopaminergique = Reward Prediction Error
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DopamineSignal {
    pub baseline_exploration: f64,
    pub learning_rate: f64,
    pub max_exploration: f64,
    pub min_exploration: f64,
    pub stress_adaptation_rate: f64,
    pub prediction_history: Vec<f64>,
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
            stress_adaptation_rate: 0.02,
            prediction_history: Vec::new(),
        }
    }

    /// Applique RPE au Director
    pub fn apply(&mut self, director: &mut Director, expected_reward: f64, actual_reward: f64) {
        let rpe = (actual_reward - expected_reward).clamp(-1.0, 1.0);

        self.prediction_history.push(expected_reward);
        if self.prediction_history.len() > 100 {
            self.prediction_history.remove(0);
        }

        let delta = self.learning_rate * rpe;
        director.exploration_weight = (director.exploration_weight + delta)
            .clamp(self.min_exploration, self.max_exploration);

        if rpe > 0.5 {
            director.stress_cost_weight = (director.stress_cost_weight * (1.0 - self.stress_adaptation_rate)).max(0.1);
        } else if rpe < -0.5 {
            director.stress_cost_weight = (director.stress_cost_weight * (1.0 + self.stress_adaptation_rate)).min(5.0);
        }
    }

    /// Calcule récompense attendue depuis WorldState
    pub fn expected_reward(&self, world: &WorldState) -> f64 {
        if world.budget <= 0.0 {
            return 0.0;
        }

        let goal_progress = world.progress(&Goal::Explore);
        let budget_factor = (world.budget / 1000.0).min(1.0);
        let threat_penalty = world.threat * 0.3;
        let agent_efficiency = if world.workers > 0 {
            (world.workers as f64 / world.required_workers.max(1) as f64).min(1.0)
        } else { 0.0 };

        (goal_progress * 0.5 + budget_factor * 0.2 + agent_efficiency * 0.3 - threat_penalty).clamp(0.0, 1.0)
    }

    /// Calcule récompense réelle depuis outcome
    pub fn actual_reward(&self, outcome: &CreativityOutcome) -> f64 {
        match outcome {
            CreativityOutcome::Validated { evidence_score, atp_consumed, .. } => {
                let efficiency = if *atp_consumed > 0.0 { 1.0 / (1.0 + atp_consumed / 100.0) } else { 1.0 };
                (*evidence_score / 100.0) * efficiency
            }
            CreativityOutcome::Falsified { .. } => -0.5,
            CreativityOutcome::NoAnswer { .. } => -0.1,
            CreativityOutcome::Error { .. } => -1.0,
        }
    }

    /// Calcule reward prédit pour logging/métriques
    pub fn predicted_reward(&self) -> f64 {
        if self.prediction_history.is_empty() {
            0.5
        } else {
            self.prediction_history.iter().sum::<f64>() / self.prediction_history.len() as f64
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CreativityOutcome {
    Validated { evidence_score: f64, atp_consumed: f64, concept: crate::planner::Concept },
    Falsified { concept: crate::planner::Concept, reason: String },
    NoAnswer { concept: crate::planner::Concept },
    Error { concept: crate::planner::Concept, error: String },
}

impl CreativityOutcome {
    pub fn concept(&self) -> crate::planner::Concept {
        match self {
            CreativityOutcome::Validated { concept, .. } => *concept,
            CreativityOutcome::Falsified { concept, .. } => *concept,
            CreativityOutcome::NoAnswer { concept } => *concept,
            CreativityOutcome::Error { concept, .. } => *concept,
        }
    }

    pub fn is_success(&self) -> bool {
        matches!(self, CreativityOutcome::Validated { .. })
    }
}