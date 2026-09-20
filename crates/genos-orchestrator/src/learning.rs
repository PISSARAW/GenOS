//! Apprentissage : bandit contextuel linéaire par concept.
//!
//! Chaque concept apprend une récompense attendue en fonction du **contexte**
//! (features du `WorldState`), au lieu d'un simple taux de succès global. La
//! récompense d'épisode est **propagée** aux concepts du plan (assignation de
//! crédit). Les poids persistent entre missions (transfert).

use crate::planner::{Concept, WorldState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Dimension du vecteur de contexte.
pub const CONTEXT_DIM: usize = 8;

/// Extrait un contexte normalisé depuis l'état du monde.
pub fn context_from_state(state: &WorldState) -> Vec<f64> {
    vec![
        state.threat.clamp(0.0, 1.0),
        (state.diseased as f64 / 3.0).clamp(0.0, 1.0),
        state.budget_pressure.clamp(0.0, 1.0),
        state.stress.clamp(0.0, 1.0),
        if state.uncertain { 1.0 } else { 0.0 },
        (state.workers as f64 / 5.0).clamp(0.0, 1.0),
        if state.observed { 1.0 } else { 0.0 },
        if state.adversary { 1.0 } else { 0.0 },
    ]
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Régression logistique en ligne : récompense attendue `P(succès | contexte)`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LinearBandit {
    pub weights: Vec<f64>,
    pub bias: f64,
    pub updates: u64,
}

impl Default for LinearBandit {
    fn default() -> Self {
        Self {
            weights: vec![0.0; CONTEXT_DIM],
            bias: 0.0,
            updates: 0,
        }
    }
}

impl LinearBandit {
    pub fn predict(&self, ctx: &[f64]) -> f64 {
        let z = self.bias + dot(&self.weights, ctx);
        1.0 / (1.0 + (-z).exp())
    }

    pub fn update(&mut self, ctx: &[f64], reward: f64, lr: f64) {
        let predicted = self.predict(ctx);
        let gradient = reward - predicted;
        for (weight, feature) in self.weights.iter_mut().zip(ctx.iter()) {
            *weight += lr * gradient * feature;
        }
        self.bias += lr * gradient;
        self.updates += 1;
    }
}

/// Ensemble des bandits par concept (mémoire d'expérience persistante).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Learner {
    pub bands: HashMap<Concept, LinearBandit>,
    pub episodes: u64,
}

impl Learner {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn predict(&self, concept: Concept, ctx: &[f64]) -> f64 {
        self.bands
            .get(&concept)
            .map(|band| band.predict(ctx))
            .unwrap_or(0.5)
    }

    pub fn updates(&self, concept: Concept) -> u64 {
        self.bands.get(&concept).map(|band| band.updates).unwrap_or(0)
    }

    pub fn update(&mut self, concept: Concept, ctx: &[f64], reward: f64) {
        let band = self.bands.entry(concept).or_default();
        band.update(ctx, reward.clamp(0.0, 1.0), 0.2);
        self.episodes += 1;
    }

    /// Assignation de crédit : propage la récompense d'épisode aux concepts du
    /// plan, plus forte pour les concepts proches de la fin (facteur `gamma`).
    pub fn assign_credit(&mut self, plan: &[Concept], ctx: &[f64], reward: f64) {
        let gamma = 0.9_f64;
        let n = plan.len();
        for (index, concept) in plan.iter().enumerate() {
            let distance_to_end = n.saturating_sub(index + 1);
            let discounted = reward * gamma.powi(distance_to_end as i32);
            self.update(*concept, ctx, discounted);
        }
    }
}
