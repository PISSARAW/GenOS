//! Phase F — Métacognition : auto-modèle évolutionnaire pour le moteur D.
//!
//! Le moteur D observe ses propres processus de recherche/évolution, détecte
//! des patterns dans sa propre trajectoire (stagnation, biais, boucles), et
//! s'adapte en conséquence via des ajustements de ses paramètres internes.
//!
//! Ce module est un self-model ÉVOLUTIONNAIRE (trajectoire de fitness,
//! usage des opérateurs) — pas une conscience. Le terme « conscience » est
//! réservé au programme expérimental qui évaluera plusieurs indicateurs.

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

/// Rapport d'une itération de la boucle métacognitive (Phase F runtime).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetacognitionStepReport {
    pub generation: u32,
    pub best_fitness: f64,
    pub mean_fitness: f64,
    pub signals: Vec<CognitiveSignal>,
    pub adjustment: Adjustment,
    pub scores: Vec<f64>,
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
        recent
            .iter()
            .all(|s| (s.best_fitness - first).abs() < self.stagnation_threshold)
    }

    /// Biais cumulé : usage agrégé par opérateur sur toute la trajectoire.
    /// bias = max_k usage_k / Σ_k usage_k
    pub fn detect_bias(&self) -> f64 {
        let aggregate = self.aggregate_operator_usage();
        let total: u32 = aggregate.values().sum();
        if total == 0 {
            return 0.0;
        }
        let max_usage = aggregate.values().copied().max().unwrap_or(0);
        max_usage as f64 / total as f64
    }

    fn aggregate_operator_usage(&self) -> HashMap<String, u32> {
        let mut aggregate: HashMap<String, u32> = HashMap::new();
        for snapshot in &self.trajectory {
            for (op, count) in &snapshot.operator_usage {
                *aggregate.entry(op.clone()).or_insert(0) += count;
            }
        }
        aggregate
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
    generation: u32,
}

impl MetacognitionEngine {
    pub fn new() -> Self {
        Self {
            model: SelfModel::new(),
            bias_threshold: 0.7,
            stagnation_window: 5,
            generation: 0,
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
        let diversity = self
            .model
            .trajectory
            .last()
            .map(|s| s.diversity_score)
            .unwrap_or(0.0);
        if diversity > 0.6 {
            signals.push(CognitiveSignal::DiverseEnough);
        } else if diversity < 0.3 {
            signals.push(CognitiveSignal::Converging);
        }
        signals
    }

    fn build_snapshot(&self, cycle: &mut PhaseDCycle, generation: u32) -> GenerationSnapshot {
        let coverage = cycle.diversity().coverage();
        let diversity_score = coverage_ratio(coverage);
        GenerationSnapshot {
            generation,
            best_fitness: cycle.last_best_fitness(),
            mean_fitness: cycle.last_mean_fitness(),
            diversity_score,
            operator_usage: cycle.operator_usage().clone(),
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

    /// Boucle métacognitive complète pour une génération :
    /// évalue la population, observe, décide, applique.
    ///
    /// C'est le point d'entrée runtime de la Phase F : le moteur D
    /// s'auto-observe PENDANT l'évolution réelle, pas à côté.
    pub fn run_cycle(
        &mut self,
        cycle: &mut PhaseDCycle,
        population: &[crate::genome::Genome],
    ) -> MetacognitionStepReport {
        self.generation += 1;
        let scores = cycle.evaluate(population);
        let signals = self.monitor(cycle, self.generation);
        let adjustment = Self::decide_adjustment(&signals);
        self.apply_adjustment(adjustment.clone(), cycle);
        MetacognitionStepReport {
            generation: self.generation,
            best_fitness: cycle.last_best_fitness(),
            mean_fitness: cycle.last_mean_fitness(),
            signals,
            adjustment,
            scores,
        }
    }

    /// Dernière génération observée par cette instance.
    pub fn generation(&self) -> u32 {
        self.generation
    }

    fn expand_search(&self, cycle: &mut PhaseDCycle) {
        let engine = cycle.diversity_mut();
        engine.spawn_radius = (engine.spawn_radius * 1.5).min(10.0);
        engine.max_niches = (engine.max_niches + 5).min(50);
    }

    fn switch_operators(&self, cycle: &mut PhaseDCycle) {
        let pool = cycle.operators_mut();
        pool.crossover_rate = 0.9 - pool.crossover_rate;
        pool.mutator.mutation_rates.nucleotide =
            (pool.mutator.mutation_rates.nucleotide * 1.3).min(0.5);
    }

    fn reset_environment(&self, cycle: &mut PhaseDCycle) {
        cycle.shift_environment();
    }

    fn increase_mutation(&self, cycle: &mut PhaseDCycle) {
        let pool = cycle.operators_mut();
        pool.mutator.mutation_rates.nucleotide =
            (pool.mutator.mutation_rates.nucleotide * 1.2).min(0.5);
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

fn coverage_ratio(coverage: (usize, usize)) -> f64 {
    if coverage.1 > 0 {
        coverage.0 as f64 / coverage.1 as f64
    } else {
        0.0
    }
}

#[cfg(test)]
#[path = "metacognition_tests.rs"]
mod tests;
