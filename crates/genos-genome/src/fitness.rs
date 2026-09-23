use crate::genome::Genome;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FitnessRecord {
    pub score: f64,
    pub task_id: String,
    pub replication: u32,
}

#[derive(Clone, Debug, Default)]
struct TaskProfile {
    required_tools: Vec<String>,
    required_caps: Vec<String>,
    family: String,
}

pub struct FitnessExperiment;

impl FitnessExperiment {
    pub fn new() -> Self { Self }

    pub fn evaluate(&self, genome: &Genome, task: &str) -> FitnessRecord {
        let profile = task_profile(task);
        let expressed = expressed_loci(genome);
        let score = behavioral_score(genome, &profile, &expressed, task);
        FitnessRecord { score, task_id: task.to_string(), replication: 0 }
    }

    pub fn evaluate_instance(&self, genome: &Genome, task: &str, instance: u32) -> FitnessRecord {
        let key = format!("{task}::instance{instance}");
        let profile = task_profile(&key);
        let expressed = expressed_loci(genome);
        let score = behavioral_score(genome, &profile, &expressed, &key);
        FitnessRecord { score, task_id: task.to_string(), replication: instance }
    }
}

impl Default for FitnessExperiment {
    fn default() -> Self { Self::new() }
}

pub fn replicate_fitness(input: (&Genome, &str, u32)) -> Vec<FitnessRecord> {
    let (genome, task, n) = input;
    let experiment = FitnessExperiment::new();
    (0..n).map(|i| experiment.evaluate_instance(genome, task, i)).collect()
}

fn task_profile(task: &str) -> TaskProfile {
    let lower = task.to_lowercase();
    let mut profile = TaskProfile::default();
    profile.family = task_family(&lower);
    profile.required_tools = required_tools(&lower);
    profile.required_caps = required_caps(&lower, &profile.family);
    profile
}

fn task_family(lower: &str) -> String {
    if lower.contains("math") || lower.contains("logic") {
        "math".to_string()
    } else if lower.contains("code") || lower.contains("implement") {
        "code".to_string()
    } else if lower.contains("creative") || lower.contains("write") {
        "creative".to_string()
    } else {
        "general".to_string()
    }
}

fn required_tools(lower: &str) -> Vec<String> {
    let mut out = Vec::new();
    for token in lower.split(|c: char| !c.is_ascii_alphanumeric()) {
        if token.starts_with("tool") && token.len() > 4 {
            out.push(token.to_uppercase());
        }
    }
    if out.is_empty() {
        out.push("TOOL_BASE".to_string());
    }
    out
}

fn required_caps(lower: &str, family: &str) -> Vec<String> {
    let mut out = Vec::new();
    for token in lower.split(|c: char| !c.is_ascii_alphanumeric()) {
        if token.starts_with("cap") && token.len() > 3 {
            out.push(token.to_uppercase());
        }
    }
    if out.is_empty() {
        out.push(match family {
            "math" => "CAP_LOGIC".to_string(),
            "code" => "CAP_IMPLEMENT".to_string(),
            "creative" => "CAP_WRITE".to_string(),
            _ => "CAP_GENERAL".to_string(),
        });
    }
    out
}

fn expressed_loci(genome: &Genome) -> Vec<String> {
    genome
        .genes
        .iter()
        .filter(|(_, gene)| gene.p53_repair_check())
        .map(|(locus, _)| locus.clone())
        .collect()
}

fn behavioral_score(genome: &Genome, profile: &TaskProfile, expressed: &[String], key: &str) -> f64 {
    let tool_outcomes = mean_outcome(genome, &profile.required_tools, expressed, key, "tool");
    let cap_outcomes = mean_outcome(genome, &profile.required_caps, expressed, key, "cap");
    let strategy_bonus = strategy_bonus(genome, expressed);
    let viability = viability_baseline(expressed);
    let cost = execution_cost(genome);
    ((tool_outcomes * 55.0 + cap_outcomes * 25.0 + strategy_bonus * 10.0 + viability) - cost).clamp(0.0, 100.0)
}

fn viability_baseline(expressed: &[String]) -> f64 {
    (expressed.len() as f64).min(5.0)
}

fn mean_outcome(genome: &Genome, required: &[String], expressed: &[String], key: &str, kind: &str) -> f64 {
    if required.is_empty() {
        return 1.0;
    }
    let total: f64 = required.iter().map(|item| trial_outcome(genome, item, expressed, key, kind)).sum();
    total / required.len() as f64
}

fn trial_outcome(genome: &Genome, item: &str, expressed: &[String], key: &str, kind: &str) -> f64 {
    let present = expressed.iter().any(|locus| locus.contains(item) || item.contains(locus.as_str()));
    let draw = hash_draw(genome, key, item, kind);
    if present {
        if draw < 0.85 { 1.0 } else { 0.0 }
    } else if draw < 0.05 {
        1.0
    } else {
        0.0
    }
}

fn hash_draw(genome: &Genome, key: &str, item: &str, kind: &str) -> f64 {
    let mut hasher = DefaultHasher::new();
    genome.genome_id().hash(&mut hasher);
    key.hash(&mut hasher);
    item.hash(&mut hasher);
    kind.hash(&mut hasher);
    let raw = hasher.finish();
    (raw % 10_000) as f64 / 10_000.0
}

fn strategy_bonus(genome: &Genome, expressed: &[String]) -> f64 {
    let has_strategy = expressed.iter().any(|locus| locus == "STRATEGY" || locus.starts_with("STRATEGY_"));
    let has_objective = expressed.iter().any(|locus| locus.starts_with("OBJECTIVE_"));
    let _ = genome;
    match (has_strategy, has_objective) {
        (true, true) => 1.0,
        (true, false) => 0.6,
        (false, true) => 0.4,
        (false, false) => 0.0,
    }
}

fn execution_cost(genome: &Genome) -> f64 {
    let volume: f64 = genome.genes.values().map(|gene| gene.expression_volume).sum();
    let extra = genome.extra_chromosomes.len() as f64;
    volume * 0.2 + extra * 0.5
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
