//! Phase F — Conscience : auto-modèle et métacognition pour le moteur D.
//!
//! Le moteur D observe ses propres processus de recherche/évolution, détecte
//! des patterns dans sa propre trajectoire (stagnation, biais, boucles), et
//! s'adapte en conséquence via des ajustements de ses paramètres internes.

use crate::phase_d::PhaseDCycle;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════════════════════════════════════════
// F.1 — Signaux cognitifs et ajustements
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum CognitiveSignal {
    StagnationDetected,
    BiasDetected,
    LoopDetected,
    DiverseEnough,
    Converging,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Adjustment {
    ExpandSearch,
    SwitchOperators,
    ResetEnvironment,
    IncreaseMutation,
    ReduceBias,
}

// ═══════════════════════════════════════════════════════════════════════════════
// F.2 — Snapshot de génération pour la trajectoire
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenerationSnapshot {
    pub generation: u32,
    pub best_fitness: f64,
    pub mean_fitness: f64,
    pub diversity_score: f64,
    pub operator_usage: HashMap<String, u32>,
    pub niche_coverage: (usize, usize),
}

impl GenerationSnapshot {
    pub fn new(generation: u32, best_fitness: f64, mean_fitness: f64) -> Self {
        Self {
            generation,
            best_fitness,
            mean_fitness,
            diversity_score: 0.0,
            operator_usage: HashMap::new(),
            niche_coverage: (0, 0),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// F.3 — Auto-modèle : détection de stagnation, biais, boucles
// ═══════════════════════════════════════════════════════════════════════════════

pub struct SelfModel {
    trajectory: Vec<GenerationSnapshot>,
    stagnation_threshold: f64,
}

impl SelfModel {
    pub fn new() -> Self {
        Self {
            trajectory: Vec::new(),
            stagnation_threshold: 1e-4,
        }
    }

    pub fn record(&mut self, snapshot: GenerationSnapshot) {
        self.trajectory.push(snapshot);
    }

    /// Détecte la stagnation : fitness plat sur une fenêtre de N générations.
    pub fn detect_stagnation(&self, window: usize) -> bool {
        if self.trajectory.len() < window || window == 0 {
            return false;
        }
        let recent = &self.trajectory[self.trajectory.len() - window..];
        let first = recent[0].best_fitness;
        recent.iter().all(|s| (s.best_fitness - first).abs() < self.stagnation_threshold)
    }

    /// Calcule le biais cumulé dans la sélection des opérateurs.
    pub fn detect_bias(&self) -> f64 {
        let total: u32 = self
            .trajectory
            .iter()
            .flat_map(|s| s.operator_usage.values())
            .sum();
        if total == 0 {
            return 0.0;
        }
        let mut max_usage = 0u32;
        for snapshot in &self.trajectory {
            for &count in snapshot.operator_usage.values() {
                if count > max_usage {
                    max_usage = count;
                }
            }
        }
        max_usage as f64 / total as f64
    }

    /// Détecte une boucle : pattern répétitif dans la trajectoire.
    pub fn detect_loop(&self) -> bool {
        if self.trajectory.len() < 4 {
            return false;
        }
        let len = self.trajectory.len();
        let half = len / 2;
        let recent = &self.trajectory[len - half..];
        let previous = &self.trajectory[len - 2 * half..len - half];
        if recent.len() != previous.len() {
            return false;
        }
        recent.iter().zip(previous.iter()).all(|(a, b)| {
            (a.best_fitness - b.best_fitness).abs() < self.stagnation_threshold
                && (a.mean_fitness - b.mean_fitness).abs() < self.stagnation_threshold
        })
    }

    pub fn trajectory_len(&self) -> usize {
        self.trajectory.len()
    }
}

impl Default for SelfModel {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// F.4 — Moteur de métacognition : observation et ajustement
// ═══════════════════════════════════════════════════════════════════════════════

pub struct MetacognitionEngine {
    model: SelfModel,
    bias_threshold: f64,
    stagnation_window: usize,
}

impl MetacognitionEngine {
    pub fn new() -> Self {
        Self {
            model: SelfModel::new(),
            bias_threshold: 0.7,
            stagnation_window: 5,
        }
    }

    /// Observe les sorties du cycle Phase D et produit des signaux.
    pub fn monitor(&mut self, cycle: &mut PhaseDCycle, generation: u32) -> Vec<CognitiveSignal> {
        let snapshot = self.build_snapshot(cycle, generation);
        self.model.record(snapshot);
        let mut signals = Vec::new();
        if self.model.detect_stagnation(self.stagnation_window) {
            signals.push(CognitiveSignal::StagnationDetected);
        }
        if self.model.detect_bias() > self.bias_threshold {
            signals.push(CognitiveSignal::BiasDetected);
        }
        if self.model.detect_loop() {
            signals.push(CognitiveSignal::LoopDetected);
        }
        if !signals.is_empty() {
            return signals;
        }
        let coverage = cycle.diversity().coverage();
        let diversity = if coverage.1 > 0 {
            coverage.0 as f64 / coverage.1 as f64
        } else {
            0.0
        };
        if diversity > 0.6 {
            signals.push(CognitiveSignal::DiverseEnough);
        } else if diversity < 0.3 {
            signals.push(CognitiveSignal::Converging);
        }
        signals
    }

    fn build_snapshot(&self, cycle: &PhaseDCycle, generation: u32) -> GenerationSnapshot {
        let coverage = cycle.diversity().coverage();
        let diversity_score = if coverage.1 > 0 {
            coverage.0 as f64 / coverage.1 as f64
        } else {
            0.0
        };
        GenerationSnapshot {
            generation,
            best_fitness: 0.0,
            mean_fitness: 0.0,
            diversity_score,
            operator_usage: HashMap::new(),
            niche_coverage: coverage,
        }
    }

    /// Décide quel ajustement appliquer en fonction des signaux.
    pub fn decide_adjustment(signals: &[CognitiveSignal]) -> Adjustment {
        for signal in signals {
            match signal {
                CognitiveSignal::StagnationDetected => return Adjustment::ExpandSearch,
                CognitiveSignal::BiasDetected => return Adjustment::ReduceBias,
                CognitiveSignal::LoopDetected => return Adjustment::SwitchOperators,
                _ => {}
            }
        }
        Adjustment::IncreaseMutation
    }

    /// Applique l'ajustement au cycle Phase D.
    pub fn apply_adjustment(&self, adjustment: Adjustment, cycle: &mut PhaseDCycle) {
        match adjustment {
            Adjustment::ExpandSearch => self.expand_search(cycle),
            Adjustment::SwitchOperators => self.switch_operators(cycle),
            Adjustment::ResetEnvironment => self.reset_environment(cycle),
            Adjustment::IncreaseMutation => self.increase_mutation(cycle),
            Adjustment::ReduceBias => self.reduce_bias(cycle),
        }
    }

    fn expand_search(&self, cycle: &mut PhaseDCycle) {
        let engine = cycle.diversity_mut();
        engine.spawn_radius = (engine.spawn_radius * 1.5).min(10.0);
        engine.max_niches = (engine.max_niches + 5).min(50);
    }

    fn switch_operators(&self, cycle: &mut PhaseDCycle) {
        let pool = cycle.operators_mut();
        pool.crossover_rate = 0.9 - pool.crossover_rate;
        pool.mutator.mutation_rates.nucleotide = (pool.mutator.mutation_rates.nucleotide * 1.3).min(0.5);
    }

    fn reset_environment(&self, cycle: &mut PhaseDCycle) {
        cycle.shift_environment();
    }

    fn increase_mutation(&self, cycle: &mut PhaseDCycle) {
        let pool = cycle.operators_mut();
        pool.mutator.mutation_rates.nucleotide = (pool.mutator.mutation_rates.nucleotide * 1.2).min(0.5);
        pool.mutator.mutation_rates.gene = (pool.mutator.mutation_rates.gene * 1.2).min(0.5);
    }

    fn reduce_bias(&self, cycle: &mut PhaseDCycle) {
        let pool = cycle.operators_mut();
        pool.crossover_rate = (pool.crossover_rate + 0.1).min(0.8);
        pool.mutator.mutation_rates.gene = (pool.mutator.mutation_rates.gene * 0.9).max(0.001);
    }

    pub fn model(&self) -> &SelfModel {
        &self.model
    }
}

impl Default for MetacognitionEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn self_model_detects_stagnation_in_flat_trajectory() {
        let mut model = SelfModel::new();
        for i in 0..6 {
            let mut snap = GenerationSnapshot::new(i, 1.0, 0.5);
            snap.best_fitness = 10.0;
            model.record(snap);
        }
        assert!(model.detect_stagnation(5));
    }

    #[test]
    fn self_model_detects_loop_in_repeating_trajectory() {
        let mut model = SelfModel::new();
        for _ in 0..2 {
            for i in 0..3 {
                let mut snap = GenerationSnapshot::new(i, 5.0, 2.0);
                snap.best_fitness = 5.0 + i as f64 * 0.00001;
                model.record(snap);
            }
        }
        assert!(model.detect_loop());
    }

    #[test]
    fn metacognition_returns_stagnation_for_flat_inputs() {
        let mut engine = MetacognitionEngine::new();
        let cycle = PhaseDCycle::new(vec!["t1".into()]);
        let mut detected = false;
        for i in 0..10 {
            let signals = engine.monitor(&mut cycle.clone(), i);
            if signals.contains(&CognitiveSignal::StagnationDetected) {
                detected = true;
                break;
            }
        }
        assert!(detected);
    }

    #[test]
    fn adjustment_modifies_operator_probabilities() {
        let engine = MetacognitionEngine::new();
        let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
        let initial_rate = cycle.operators_mut().crossover_rate;
        engine.apply_adjustment(Adjustment::SwitchOperators, &mut cycle);
        let new_rate = cycle.operators_mut().crossover_rate;
        assert_ne!(initial_rate, new_rate);
    }

    #[test]
    fn self_model_no_stagnation_with_progress() {
        let mut model = SelfModel::new();
        for i in 0..6 {
            let mut snap = GenerationSnapshot::new(i, 10.0 + i as f64, 5.0);
            model.record(snap);
        }
        assert!(!model.detect_stagnation(5));
    }

    #[test]
    fn detect_bias_returns_zero_when_empty() {
        let model = SelfModel::new();
        assert_eq!(model.detect_bias(), 0.0);
    }
}
