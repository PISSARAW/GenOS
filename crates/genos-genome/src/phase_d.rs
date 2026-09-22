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
        let replicated = exp.replicate(genome, task, 3);
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

#[derive(Clone, Debug)]
pub struct PhaseDCycle {
    fitness: ExperimentalFitness,
    diversity: QDDiversityEngine,
    env: EnvironmentManager,
    operators: EvolutionaryOperatorPool,
}

impl PhaseDCycle {
    pub fn new(tasks: Vec<String>) -> Self {
        Self {
            fitness: ExperimentalFitness::new(),
            diversity: QDDiversityEngine::new(vec![]),
            env: EnvironmentManager::new(tasks),
            operators: EvolutionaryOperatorPool::new(),
        }
    }

    /// Évalue toute la population sur l'environnement courant.
    pub fn evaluate(&mut self, population: &[Genome]) -> Vec<f64> {
        population.iter().map(|g| self.evaluate_one(g)).collect()
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;

    fn genome() -> Genome {
        let mut g = Genome::new("PHASE_D_TEST");
        let gene = crate::gene::Gene::new("PD_GENE", "ATGCATGCATGC");
        g.insert_gene(gene);
        g
    }

    #[test]
    fn experimental_fitness_measure() {
        let mut ef = ExperimentalFitness::new();
        let g = genome();
        let score = ef.measure(&g, "task1");
        assert!(score >= 0.0);
    }

    #[test]
    fn experimental_fitness_significance() {
        let mut ef = ExperimentalFitness::new();
        let g = genome();
        for _ in 0..4 {
            ef.measure(&g, "task1");
        }
        assert!(ef.is_significant("task1", 0.5));
    }

    #[test]
    fn experimental_fitness_ablation() {
        let mut ef = ExperimentalFitness::new();
        let g = genome();
        let score = ef.ablate_and_measure(&g, "task1");
        assert!(score >= 0.0);
    }

    #[test]
    fn qd_engine_expand() {
        let mut engine = QDDiversityEngine::new(vec![]);
        let mut g = genome();
        g.extra_chromosomes
            .push(crate::dna::DnaStrand::synthesize("ATGCATGCATGCATGCATGC"));
        let expanded = engine.expand_if_needed(&g, "far_genome");
        assert!(expanded);
        assert_eq!(engine.coverage().1, 1);
    }

    #[test]
    fn qd_engine_insert() {
        let mut engine = QDDiversityEngine::new(vec![Niche {
            id: "n1".into(),
            center: vec![1.0, 1.0, 0.0],
            radius: 5.0,
            occupant: None,
            best_fitness: 0.0,
        }]);
        let g = genome();
        let inserted = engine.evaluate_and_insert(&g, "g1", 50.0);
        assert!(inserted);
    }

    #[test]
    fn environment_shift() {
        let mut env = EnvironmentManager::new(vec!["a".into(), "b".into()]);
        env.shift_to_next_phase();
        assert_eq!(env.phase, 1);
    }

    #[test]
    fn operator_pool_adapt_low_diversity() {
        let mut pool = EvolutionaryOperatorPool::new();
        let initial = pool.crossover_rate;
        pool.adapt(0.1, -0.5);
        assert!(pool.crossover_rate > initial);
    }

    #[test]
    fn phase_d_cycle_evaluate() {
        let mut cycle = PhaseDCycle::new(vec!["t1".into(), "t2".into()]);
        let pop = vec![genome(), genome()];
        let scores = cycle.evaluate(&pop);
        assert_eq!(scores.len(), 2);
    }

    #[test]
    fn phase_d_cycle_shift_and_adapt() {
        let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
        cycle.shift_environment();
        cycle.adapt_operators(0.1, -0.3);
        assert_eq!(cycle.env.phase, 1);
    }
}
