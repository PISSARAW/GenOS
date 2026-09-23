use crate::genome::Genome;
use rand::SeedableRng;
use rand::RngExt;
use rand::rngs::StdRng;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FitnessRecord {
    pub score: f64,
    pub task_id: String,
    pub replication: u32,
}

pub struct FitnessExperiment;

impl FitnessExperiment {
    pub fn new() -> Self { Self }

    pub fn evaluate(&self, genome: &Genome, task: &str) -> FitnessRecord {
        let genes = &genome.genes;
        let gene_count = genes.len().max(1) as f64;
        let task_lower = task.to_lowercase();
        let total_volume: f64 = genes.values().map(|g| g.expression_volume).sum();
        let score = if task_lower.contains("math") || task_lower.contains("logic") {
            let strategy_genes = genes.keys().filter(|l| l.starts_with("STRATEGY_")).count() as f64;
            let tool_count = genes.keys().filter(|l| l.starts_with("TOOL_")).count() as f64;
            (strategy_genes * 15.0 + tool_count * 10.0 + total_volume * 5.0).clamp(0.0, 100.0)
        } else if task_lower.contains("code") || task_lower.contains("implement") {
            let tool_count = genes.keys().filter(|l| l.starts_with("TOOL_")).count() as f64;
            let extra_count = genome.extra_chromosomes.len() as f64;
            (tool_count * 12.0 + extra_count * 8.0 + total_volume * 6.0).clamp(0.0, 100.0)
        } else if task_lower.contains("creative") || task_lower.contains("write") {
            let strategy_genes = genes.keys().filter(|l| l.starts_with("STRATEGY_")).count() as f64;
            let prompt_genes = genes.keys().filter(|l| l.starts_with("OBJECTIVE_")).count() as f64;
            (strategy_genes * 10.0 + prompt_genes * 15.0 + total_volume * 8.0).clamp(0.0, 100.0)
        } else {
            let complexity = genome.extra_chromosomes.len() as f64 * 0.1;
            ((total_volume / gene_count) * 50.0 + complexity * 10.0).clamp(0.0, 100.0)
        };
        FitnessRecord { score, task_id: task.to_string(), replication: 0 }
    }
}

impl Default for FitnessExperiment {
    fn default() -> Self { Self::new() }
}

pub fn replicate_fitness(input: (&Genome, &str, u32)) -> Vec<FitnessRecord> {
    let (genome, task, n) = input;
    let experiment = FitnessExperiment::new();
    let base_seed = genome.genome_id().as_u128() as u64;
    (0..n).map(|i| {
        let mut r = experiment.evaluate(genome, task);
        r.replication = i;
        let mut rng = StdRng::seed_from_u64(base_seed ^ (i as u64).wrapping_mul(0x9e3779b97f4a7c15));
        let noise = rng.random_range(0.0..10.0) - 5.0;
        r.score = (r.score + noise).clamp(0.0, 100.0);
        r
    }).collect()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AblationRecord {
    pub locus: String,
    pub baseline_fitness: f64,
    pub ablated_fitness: f64,
    pub causal_contribution: f64,
}

pub struct CausalAblation;

impl CausalAblation {
    pub fn new() -> Self { Self }

    pub fn ablate_locus(input: (&Genome, &str, &str)) -> Option<AblationRecord> {
        let (genome, locus, task) = input;
        if !genome.genes.contains_key(locus) { return None; }
        let experiment = FitnessExperiment::new();
        let baseline = experiment.evaluate(genome, task).score;
        let mut knocked_out = genome.clone();
        knocked_out.crispr_cas9_knockout(locus);
        let ablated = experiment.evaluate(&knocked_out, task).score;
        Some(AblationRecord {
            locus: locus.to_string(),
            baseline_fitness: baseline,
            ablated_fitness: ablated,
            causal_contribution: baseline - ablated,
        })
    }

    pub fn ablate_all_somatic(&self, genome: &Genome, task: &str) -> Vec<AblationRecord> {
        let somatic: Vec<String> = genome.genes.keys()
            .filter(|l| !l.starts_with("LOCUS_INSTINCT_"))
            .cloned()
            .collect();
        somatic.iter().filter_map(|l| Self::ablate_locus((genome, l, task))).collect()
    }
}

impl Default for CausalAblation {
    fn default() -> Self { Self::new() }
}
