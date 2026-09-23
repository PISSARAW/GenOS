//! Phase D — Moteur de recherche naturel : fitness expérimentale, ablations
//! causales, QD/niches adaptatives, environnement changeant, opérateurs
//! évolutifs qui eux-mêmes évoluent.

use crate::fitness::{CausalAblation, FitnessExperiment};
use crate::genome::Genome;
use crate::niches::{euclidean_distance, EnvironmentState, Niche, QDArchive};
use crate::self_modifying::SelfModifyingMutator;
use rand::Rng;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════════════════════════════════════════
// D.1 — Fitness expérimental avec quantification d'incertitude
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ExperimentalFitness {
    records: HashMap<String, Vec<f64>>,
}

impl ExperimentalFitness {
    pub fn new() -> Self {
        Self {
            records: HashMap::new(),
        }
    }

    /// Mesure le fitness sur une tâche avec réplication (n=3).
    pub fn measure(&mut self, genome: &Genome, task: &str) -> f64 {
        let exp = FitnessExperiment::new();
        let replicated = crate::fitness::replicate_fitness((genome, task, 3));
        let mean = replicated.iter().map(|r| r.score).sum::<f64>() / replicated.len().max(1) as f64;
        self.records.entry(task.to_string()).or_default().push(mean);
        mean
    }

    /// Vérifie si la mesure est stable (coefficient de variation < seuil).
    pub fn is_significant(&self, task: &str, threshold: f64) -> bool {
        let vals = match self.records.get(task) {
            Some(v) if v.len() >= 2 => v,
            _ => return false,
        };
        let n = vals.len() as f64;
        let mean = vals.iter().sum::<f64>() / n;
        if mean.abs() < 1e-9 {
            return false;
        }
        let variance = vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
        variance.sqrt() / mean.abs() < threshold
    }

    /// Ablation causale intégrée : pénalise les loci instables.
    pub fn ablate_and_measure(&mut self, genome: &Genome, task: &str) -> f64 {
        let score = self.measure(genome, task);
        let ablation = CausalAblation::new();
        let contributions = ablation.ablate_all_somatic(genome, task);
        let penalty: f64 = contributions
            .iter()
            .map(|c| c.causal_contribution.abs())
            .sum();
        (score - penalty * 0.01).max(0.0)
    }
}

impl Default for ExperimentalFitness {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// D.2 — QD Diversity : maintenance adaptative avec création de niches
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug)]
pub struct QDDiversityEngine {
    archive: QDArchive,
    pub spawn_radius: f64,
    pub max_niches: usize,
}

impl QDDiversityEngine {
    pub fn new(niches: Vec<Niche>) -> Self {
        Self {
            archive: QDArchive::new(niches),
            spawn_radius: 1.5,
            max_niches: 20,
        }
    }

    /// Insère dans l'archive si amélioration de la niche cible.
    pub fn evaluate_and_insert(&mut self, genome: &Genome, id: &str, fitness: f64) -> bool {
        self.archive.insert(genome, id, fitness)
    }

    /// Crée automatiquement une nouvelle niche pour un génome excentrique.
    pub fn expand_if_needed(&mut self, genome: &Genome, id: &str) -> bool {
        let descriptor = self.archive.describe(genome);
        let min_dist = self
            .archive
            .niches
            .iter()
            .map(|n| euclidean_distance(&n.center, &descriptor))
            .fold(f64::INFINITY, f64::min);
        if min_dist > self.spawn_radius * 2.0 && self.archive.niches.len() < self.max_niches {
            self.archive.niches.push(Niche {
                id: format!("auto_niche_{}", self.archive.niches.len()),
                center: descriptor,
                radius: self.spawn_radius,
                occupant: Some(id.to_string()),
                best_fitness: 0.0,
            });
            return true;
        }
        false
    }

    /// Couverture actuelle (occupées / total).
    pub fn coverage(&self) -> (usize, usize) {
        self.archive.coverage()
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// D.3 — Environnement changeant par phases
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EnvironmentManager {
    state: EnvironmentState,
    phase: u32,
}

impl EnvironmentManager {
    pub fn new(tasks: Vec<String>) -> Self {
        Self {
            state: EnvironmentState::new(tasks),
            phase: 0,
        }
    }

    /// Avance à la phase suivante avec rotation et reset périodique.
    pub fn shift_to_next_phase(&mut self) {
        self.phase += 1;
        self.state.shift();
        if self.phase % 5 == 0 {
            let n = self.state.task_ids.len().max(1) as f64;
            self.state.task_weights = vec![1.0 / n; self.state.task_ids.len()];
        }
    }

    /// Poids actuels des tâches.
    pub fn weights(&self) -> &[f64] {
        &self.state.task_weights
    }

    /// Identifiants des tâches.
    pub fn task_ids(&self) -> &[String] {
        &self.state.task_ids
    }

    /// Accès interne à l'état sous-jacent.
    pub fn state(&self) -> &EnvironmentState {
        &self.state
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// D.4 — Opérateurs évolutifs auto-modifiants
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvolutionaryOperatorPool {
    pub mutator: SelfModifyingMutator,
    pub crossover_rate: f64,
}

impl EvolutionaryOperatorPool {
    pub fn new() -> Self {
        Self {
            mutator: SelfModifyingMutator::default(),
            crossover_rate: 0.3,
        }
    }

    /// Applique la mutation auto-ajustée au génome.
    pub fn apply_mutation<R: Rng + ?Sized>(&mut self, genome: &mut Genome, rng: &mut R) {
        self.mutator.mutate(genome, rng);
    }

    /// Adapte les opérateurs selon diversité et progrès.
    pub fn adapt(&mut self, diversity: f64, progress: f64) {
        if diversity < 0.2 {
            self.crossover_rate = (self.crossover_rate * 1.2).min(0.9);
        } else if diversity > 0.8 {
            self.crossover_rate = (self.crossover_rate * 0.8).max(0.05);
        }
        self.mutator.auto_adjust(progress);
    }

    /// Décide si le croisement doit avoir lieu.
    pub fn should_crossover<R: Rng + ?Sized>(&self, rng: &mut R) -> bool {
        rng.random_bool(self.crossover_rate)
    }
}

impl Default for EvolutionaryOperatorPool {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// D.5 — Cycle évolutif complet (intégrateur Phase D)
// ═══════════════════════════════════════════════════════════════════════════════

/// Résumé de la dernière évaluation de population (observé par Phase F).
#[derive(Clone, Debug, Default)]
pub struct EvaluationSummary {
    pub best_fitness: f64,
    pub mean_fitness: f64,
    pub evaluated: usize,
}

#[derive(Clone, Debug)]
pub struct PhaseDCycle {
    fitness: ExperimentalFitness,
    diversity: QDDiversityEngine,
    env: EnvironmentManager,
    operators: EvolutionaryOperatorPool,
    last_evaluation: EvaluationSummary,
    operator_usage: HashMap<String, u32>,
}

impl PhaseDCycle {
    pub fn new(tasks: Vec<String>) -> Self {
        Self {
            fitness: ExperimentalFitness::new(),
            diversity: QDDiversityEngine::new(vec![]),
            env: EnvironmentManager::new(tasks),
            operators: EvolutionaryOperatorPool::new(),
            last_evaluation: EvaluationSummary::default(),
            operator_usage: HashMap::new(),
        }
    }

    /// Évalue toute la population sur l'environnement courant.
    pub fn evaluate(&mut self, population: &[Genome]) -> Vec<f64> {
        let scores: Vec<f64> = population.iter().map(|g| self.evaluate_one(g)).collect();
        self.last_evaluation = summarize(&scores);
        scores
    }

    fn evaluate_one(&mut self, genome: &Genome) -> f64 {
        let records: HashMap<String, f64> = self
            .env
            .task_ids()
            .iter()
            .map(|task| (task.clone(), self.fitness.measure(genome, task.as_str())))
            .collect();
        self.env.state().weighted_fitness(genome, &records)
    }

    /// Fait évoluer l'environnement (changement de phase).
    pub fn shift_environment(&mut self) {
        self.env.shift_to_next_phase();
    }

    /// Adapte les opérateurs évolutifs selon l'état de la population.
    pub fn adapt_operators(&mut self, diversity: f64, progress: f64) {
        self.operators.adapt(diversity, progress);
    }

    /// Accès mutable au pool d'opérateurs.
    pub fn operators_mut(&mut self) -> &mut EvolutionaryOperatorPool {
        &mut self.operators
    }

    /// Accès au moteur de diversité.
    pub fn diversity(&self) -> &QDDiversityEngine {
        &self.diversity
    }

    /// Accès mutable au moteur de diversité.
    pub fn diversity_mut(&mut self) -> &mut QDDiversityEngine {
        &mut self.diversity
    }

    /// Résumé de la dernière évaluation (best/mean fitness réels).
    pub fn last_evaluation(&self) -> &EvaluationSummary {
        &self.last_evaluation
    }

    /// Dernier best fitness mesuré (0.0 si aucune évaluation).
    pub fn last_best_fitness(&self) -> f64 {
        self.last_evaluation.best_fitness
    }

    /// Dernier mean fitness mesuré (0.0 si aucune évaluation).
    pub fn last_mean_fitness(&self) -> f64 {
        self.last_evaluation.mean_fitness
    }

    /// Compteur cumulé d'usage des opérateurs (observé par Phase F).
    pub fn operator_usage(&self) -> &HashMap<String, u32> {
        &self.operator_usage
    }

    /// Enregistre l'usage d'un opérateur (mutation, crossover, sélection…).
    pub fn record_operator_use(&mut self, operator: &str, count: u32) {
        *self.operator_usage.entry(operator.to_string()).or_insert(0) += count;
    }
}

fn summarize(scores: &[f64]) -> EvaluationSummary {
    if scores.is_empty() {
        return EvaluationSummary::default();
    }
    let best = scores.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let mean = scores.iter().sum::<f64>() / scores.len() as f64;
    EvaluationSummary {
        best_fitness: best,
        mean_fitness: mean,
        evaluated: scores.len(),
    }
}

#[cfg(test)]
#[path = "phase_d_tests.rs"]
mod tests;
