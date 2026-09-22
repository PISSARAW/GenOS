use crate::genome::Genome;
use serde::{Deserialize, Serialize};

/// Résultat d'une mesure de fitness expérimentale.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FitnessRecord {
    pub score: f64,
    pub task_id: String,
    pub replication: u32,
}

/// Mesure de fitness expérimentale par réplication.
pub struct FitnessExperiment;

impl FitnessExperiment {
    pub fn new() -> Self {
        Self
    }

    /// Évalue un génome sur une tâche reproductible.
    pub fn evaluate(&self, genome: &Genome, task: &str) -> FitnessRecord {
        let total_volume: f64 = genome.genes.values().map(|g| g.expression_volume).sum();
        let gene_count = genome.genes.len().max(1) as f64;
        let complexity = genome.extra_chromosomes.len() as f64 * 0.1;
        let score = ((total_volume / gene_count) * 50.0 + complexity * 10.0).clamp(0.0, 100.0);
        FitnessRecord {
            score,
            task_id: task.to_string(),
            replication: 0,
        }
    }

    /// Réplique une mesure `n` fois et retourne les records.
    pub fn replicate(&self, genome: &Genome, task: &str, n: u32) -> Vec<FitnessRecord> {
        (0..n)
            .map(|i| {
                let mut r = self.evaluate(genome, task);
                r.replication = i;
                r
            })
            .collect()
    }
}

impl Default for FitnessExperiment {
    fn default() -> Self {
        Self::new()
    }
}

/// Ablation causale : contribution mesurable d'un locus au fitness.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AblationRecord {
    pub locus: String,
    pub baseline_fitness: f64,
    pub ablated_fitness: f64,
    pub causal_contribution: f64,
}

pub struct CausalAblation;

impl CausalAblation {
    pub fn new() -> Self {
        Self
    }

    /// Mesure la contribution causale d'un locus par knockout + comparaison.
    pub fn ablate_locus(&self, genome: &Genome, locus: &str, task: &str) -> Option<AblationRecord> {
        if !genome.genes.contains_key(locus) {
            return None;
        }
        let experiment = FitnessExperiment::new();
        let baseline = experiment.evaluate(genome, task).score;
        let mut knocked_out = genome.clone();
        knocked_out.crispr_cas9_knockout(locus);
        let ablated = experiment.evaluate(&knocked_out, task).score;
        let contribution = baseline - ablated;
        Some(AblationRecord {
            locus: locus.to_string(),
            baseline_fitness: baseline,
            ablated_fitness: ablated,
            causal_contribution: contribution,
        })
    }

    /// Ablation de tous les loci somatiques (pas d'instincts).
    pub fn ablate_all_somatic(&self, genome: &Genome, task: &str) -> Vec<AblationRecord> {
        let somatic: Vec<String> = genome
            .genes
            .keys()
            .filter(|l| !l.starts_with("LOCUS_INSTINCT_"))
            .cloned()
            .collect();
        somatic
            .iter()
            .filter_map(|l| self.ablate_locus(genome, l, task))
            .collect()
    }
}

impl Default for CausalAblation {
    fn default() -> Self {
        Self::new()
    }
}
