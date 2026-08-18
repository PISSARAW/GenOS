use genos_core::{
    compare_genome_and_state, compare_snapshots, AgentGenome, AgentSnapshot, BreedingStatus,
    GenomeBreedingMetadata, GenomeBreedingTarget, GenomeId, GenomeMutationChange,
    GenomeMutationMetadata, GenomeVersion, PhenotypeObservation,
};
use genos_eval::{
    pareto_select, MultiObjectiveBranchScore, ObjectiveDirection, ObjectiveScore, ParetoAssessment,
    ParetoObjective, RecombinedTraitTarget,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CohortControls {
    pub model: String,
    pub environment: String,
    pub evaluation_suite: String,
    pub seed_policy: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeredityCohortMember {
    pub treatment: String,
    pub baseline: AgentSnapshot,
    pub phenotype: PhenotypeObservation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExperienceEffect {
    pub trait_name: String,
    pub minimum: f64,
    pub maximum: f64,
    pub range: f64,
    pub member_values: Vec<(String, f64)>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeredityCohortReport {
    pub genome_id: GenomeId,
    pub controls: CohortControls,
    pub effects: Vec<ExperienceEffect>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FactorialTraitObservation {
    pub genome_id: GenomeId,
    pub treatment: String,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeExperienceEffects {
    pub genome_effect_range: f64,
    pub experience_effect_range: f64,
    pub maximum_interaction: f64,
}

pub fn analyze_genome_experience_interaction(
    observations: &[FactorialTraitObservation],
) -> Result<GenomeExperienceEffects, String> {
    let mut genomes = observations
        .iter()
        .map(|value| value.genome_id.clone())
        .collect::<Vec<_>>();
    genomes.sort_by(|a, b| a.0.cmp(&b.0));
    genomes.dedup();
    let mut treatments = observations
        .iter()
        .map(|value| value.treatment.clone())
        .collect::<Vec<_>>();
    treatments.sort();
    treatments.dedup();
    if genomes.len() < 2
        || treatments.len() < 2
        || observations.len() != genomes.len() * treatments.len()
    {
        return Err("interaction analysis requires a complete design with at least two genomes and two treatments".to_string());
    }
    let mean = |values: Vec<f64>| values.iter().sum::<f64>() / values.len() as f64;
    let genome_means = genomes
        .iter()
        .map(|genome| {
            mean(
                observations
                    .iter()
                    .filter(|value| &value.genome_id == genome)
                    .map(|value| value.value)
                    .collect(),
            )
        })
        .collect::<Vec<_>>();
    let treatment_means = treatments
        .iter()
        .map(|treatment| {
            mean(
                observations
                    .iter()
                    .filter(|value| &value.treatment == treatment)
                    .map(|value| value.value)
                    .collect(),
            )
        })
        .collect::<Vec<_>>();
    let grand = mean(observations.iter().map(|value| value.value).collect());
    let range = |values: &[f64]| {
        values.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - values.iter().copied().fold(f64::INFINITY, f64::min)
    };
    let maximum_interaction = observations
        .iter()
        .map(|observation| {
            let genome_index = genomes
                .iter()
                .position(|genome| genome == &observation.genome_id)
                .unwrap();
            let treatment_index = treatments
                .iter()
                .position(|treatment| treatment == &observation.treatment)
                .unwrap();
            (observation.value - genome_means[genome_index] - treatment_means[treatment_index]
                + grand)
                .abs()
        })
        .fold(0.0, f64::max);
    Ok(GenomeExperienceEffects {
        genome_effect_range: range(&genome_means),
        experience_effect_range: range(&treatment_means),
        maximum_interaction,
    })
}

pub fn analyze_fixed_genome_cohort(
    controls: CohortControls,
    members: &[HeredityCohortMember],
) -> Result<HeredityCohortReport, String> {
    if members.len() < 2 {
        return Err("a heredity cohort requires at least two members".to_string());
    }
    let root = &members[0];
    for member in members {
        let genome = compare_genome_and_state(&root.baseline, &member.baseline);
        if !genome.same_genome {
            return Err("cohort baselines do not share one genome".to_string());
        }
        let baseline = compare_snapshots(&root.baseline, &member.baseline);
        if !baseline.same_logical_state {
            return Err(format!(
                "cohort baseline differs before treatment: {}",
                baseline.differing_fields.join(", ")
            ));
        }
        if member.phenotype.genome_id != root.baseline.genome.id {
            return Err("phenotype observation references another genome".to_string());
        }
        if member.phenotype.evaluation_suite != controls.evaluation_suite
            || member.phenotype.model != controls.model
            || member.phenotype.environment != controls.environment
        {
            return Err("phenotype observation violates cohort controls".to_string());
        }
    }

    let mut trait_names = members
        .iter()
        .flat_map(|member| {
            member
                .phenotype
                .traits
                .iter()
                .map(|value| value.name.clone())
        })
        .collect::<Vec<_>>();
    trait_names.sort();
    trait_names.dedup();
    let effects = trait_names
        .into_iter()
        .filter_map(|trait_name| {
            let member_values = members
                .iter()
                .filter_map(|member| {
                    member
                        .phenotype
                        .traits
                        .iter()
                        .find(|value| value.name == trait_name)
                        .map(|value| (member.treatment.clone(), value.value))
                })
                .collect::<Vec<_>>();
            if member_values.len() != members.len() {
                return None;
            }
            let minimum = member_values
                .iter()
                .map(|(_, value)| *value)
                .fold(f64::INFINITY, f64::min);
            let maximum = member_values
                .iter()
                .map(|(_, value)| *value)
                .fold(f64::NEG_INFINITY, f64::max);
            Some(ExperienceEffect {
                trait_name,
                minimum,
                maximum,
                range: maximum - minimum,
                member_values,
            })
        })
        .collect();
    Ok(HeredityCohortReport {
        genome_id: root.baseline.genome.id.clone(),
        controls,
        effects,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CanonicalAgentMetrics {
    pub accuracy: f64,
    pub cost: f64,
    pub tokens: f64,
    pub latency: f64,
    pub tool_calls: f64,
    pub risk: f64,
    pub hallucinations: f64,
    pub novelty: f64,
    pub success: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SelectionCandidate {
    pub genome_id: GenomeId,
    pub metrics: CanonicalAgentMetrics,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SelectionConstraints {
    pub max_cost: f64,
    pub max_risk: f64,
    pub max_hallucinations: f64,
    pub min_success: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ArtificialSelectionReport {
    pub eligible: Vec<GenomeId>,
    pub rejected: Vec<GenomeId>,
    pub pareto: Vec<ParetoAssessment>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ControlledBenchmarkRun {
    pub genome_id: GenomeId,
    pub protocol_id: String,
    pub repetition: u32,
    pub metrics: CanonicalAgentMetrics,
}

pub fn select_controlled_generation(
    runs: &[ControlledBenchmarkRun],
    constraints: &SelectionConstraints,
) -> Result<ArtificialSelectionReport, String> {
    if runs.is_empty() {
        return Err("selection generation has no benchmark runs".to_string());
    }
    let protocol = &runs[0].protocol_id;
    if runs.iter().any(|run| &run.protocol_id != protocol) {
        return Err("benchmark runs use different protocols".to_string());
    }
    let mut genomes = runs
        .iter()
        .map(|run| run.genome_id.clone())
        .collect::<Vec<_>>();
    genomes.sort_by(|a, b| a.0.cmp(&b.0));
    genomes.dedup();
    let average = |values: Vec<f64>| values.iter().sum::<f64>() / values.len() as f64;
    let candidates = genomes
        .into_iter()
        .map(|genome_id| {
            let samples = runs
                .iter()
                .filter(|run| run.genome_id == genome_id)
                .collect::<Vec<_>>();
            SelectionCandidate {
                genome_id,
                metrics: CanonicalAgentMetrics {
                    accuracy: average(samples.iter().map(|run| run.metrics.accuracy).collect()),
                    cost: average(samples.iter().map(|run| run.metrics.cost).collect()),
                    tokens: average(samples.iter().map(|run| run.metrics.tokens).collect()),
                    latency: average(samples.iter().map(|run| run.metrics.latency).collect()),
                    tool_calls: average(samples.iter().map(|run| run.metrics.tool_calls).collect()),
                    risk: average(samples.iter().map(|run| run.metrics.risk).collect()),
                    hallucinations: average(
                        samples
                            .iter()
                            .map(|run| run.metrics.hallucinations)
                            .collect(),
                    ),
                    novelty: average(samples.iter().map(|run| run.metrics.novelty).collect()),
                    success: average(samples.iter().map(|run| run.metrics.success).collect()),
                },
            }
        })
        .collect::<Vec<_>>();
    Ok(artificial_select(&candidates, constraints))
}

pub fn artificial_select(
    candidates: &[SelectionCandidate],
    constraints: &SelectionConstraints,
) -> ArtificialSelectionReport {
    let (eligible_candidates, rejected_candidates): (Vec<_>, Vec<_>) =
        candidates.iter().partition(|candidate| {
            candidate.metrics.cost <= constraints.max_cost
                && candidate.metrics.risk <= constraints.max_risk
                && candidate.metrics.hallucinations <= constraints.max_hallucinations
                && candidate.metrics.success >= constraints.min_success
        });
    let branches = eligible_candidates
        .iter()
        .map(|candidate| MultiObjectiveBranchScore {
            branch_id: genos_core::BranchId(candidate.genome_id.0.clone()),
            objectives: vec![
                ObjectiveScore {
                    objective: "accuracy".to_string(),
                    score: candidate.metrics.accuracy,
                },
                ObjectiveScore {
                    objective: "cost".to_string(),
                    score: candidate.metrics.cost,
                },
                ObjectiveScore {
                    objective: "tokens".to_string(),
                    score: candidate.metrics.tokens,
                },
                ObjectiveScore {
                    objective: "latency".to_string(),
                    score: candidate.metrics.latency,
                },
                ObjectiveScore {
                    objective: "tool_calls".to_string(),
                    score: candidate.metrics.tool_calls,
                },
                ObjectiveScore {
                    objective: "novelty".to_string(),
                    score: candidate.metrics.novelty,
                },
                ObjectiveScore {
                    objective: "success".to_string(),
                    score: candidate.metrics.success,
                },
            ],
        })
        .collect::<Vec<_>>();
    let directions = [
        ("accuracy", ObjectiveDirection::Maximize),
        ("cost", ObjectiveDirection::Minimize),
        ("tokens", ObjectiveDirection::Minimize),
        ("latency", ObjectiveDirection::Minimize),
        ("tool_calls", ObjectiveDirection::Minimize),
        ("novelty", ObjectiveDirection::Maximize),
        ("success", ObjectiveDirection::Maximize),
    ]
    .into_iter()
    .map(|(objective, direction)| ParetoObjective {
        objective: objective.to_string(),
        direction,
    })
    .collect::<Vec<_>>();
    ArtificialSelectionReport {
        eligible: eligible_candidates
            .iter()
            .map(|candidate| candidate.genome_id.clone())
            .collect(),
        rejected: rejected_candidates
            .iter()
            .map(|candidate| candidate.genome_id.clone())
            .collect(),
        pareto: pareto_select(&branches, &directions),
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingTraitMapping {
    pub genome_field: String,
    pub target: RecombinedTraitTarget,
}

use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use genos_core::RecombinationStrategy;

pub fn cantor_pairing(k1: u64, k2: u64) -> u64 {
    (k1 + k2) * (k1 + k2 + 1) / 2 + k2
}

pub fn extract_numeric_id(id: &GenomeId) -> u64 {
    let s = &id.0;
    if let Some(idx) = s.rfind('_') {
        if let Ok(num) = s[idx + 1..].parse::<u64>() {
            return num;
        }
    }
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish() % 10000 // Keep it small to avoid overflow in next generations
}

pub fn run_breeding_program<E>(
    mut current_population: Vec<AgentGenome>,
    batch_evaluator: &E,
    constraints: &SelectionConstraints,
    strategy: &RecombinationStrategy,
    mappings: &[BreedingTraitMapping],
    population_size: usize,
    generations: usize,
    start_generation: usize,
    speciation_threshold: Option<f64>,
) -> Result<Vec<AgentGenome>, String>
where
    E: Fn(&[AgentGenome]) -> Vec<SelectionCandidate>,
{
    if current_population.is_empty() {
        return Err("Initial population cannot be empty".to_string());
    }

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::{Hash, Hasher};
    "breeding_program".hash(&mut hasher);
    let mut rand_f32 = || {
        hasher.write_u8(0);
        (hasher.finish() % 1000) as f32 / 1000.0
    };

    for gen in 0..generations {
        let current_gen_num = start_generation + gen;
        
        // 1. Evaluate current generation
        let candidates = batch_evaluator(&current_population);
        
        // 2. Select using Artificial Selection (including Pareto)
        let report = artificial_select(&candidates, constraints);
        
        // 3. Isolate Pareto front (Non-dominated)
        let mut non_dominated_ids = Vec::new();
        for assessment in &report.pareto {
            if assessment.status == genos_eval::ParetoStatus::NonDominated {
                non_dominated_ids.push(GenomeId(assessment.branch_id.0.clone()));
            }
        }
        
        if non_dominated_ids.is_empty() {
            return Err(format!("Extinction at generation {} - no candidates survived constraints or pareto selection", current_gen_num));
        }
        
        // 4. Elitism: Keep non-dominated parents
        let mut next_population = Vec::new();
        let mut non_dominated_genomes = Vec::new();
        for genome in &current_population {
            if non_dominated_ids.contains(&genome.id) {
                next_population.push(genome.clone());
                non_dominated_genomes.push(genome.clone());
            }
        }
        
        // 5. Breed to fill the rest of the population
        let mut children_produced = 0;
        while next_population.len() < population_size {
            // Randomly select two parents from the Pareto front
            let alice_idx = (rand_f32() * non_dominated_genomes.len() as f32) as usize;
            let mut bob_idx = (rand_f32() * non_dominated_genomes.len() as f32) as usize;
            if non_dominated_genomes.len() > 1 && bob_idx == alice_idx {
                bob_idx = (bob_idx + 1) % non_dominated_genomes.len();
            }
            
            let alice = &non_dominated_genomes[alice_idx];
            let bob = &non_dominated_genomes[bob_idx];
            
            let k1 = extract_numeric_id(&alice.id);
            let k2 = extract_numeric_id(&bob.id);
            let child_num_id = cantor_pairing(k1, k2);
            
            // Naming convention: gen_{N}_id_{CantorID}
            // To avoid collisions if parents are identical, we add an offset based on children produced
            let child_name = format!("gen_{}_id_{}", current_gen_num + 1, child_num_id + children_produced as u64);
            
            match breed_genomes(alice, bob, &child_name, mappings, strategy, speciation_threshold) {
                Ok(mut child) => {
                    child.id = genos_core::GenomeId(child_name);
                    next_population.push(child);
                    children_produced += 1;
                },
                Err(e) if e.contains("Rejected") => {
                    // Speciation rejection: retry with other parents in the next iteration
                    continue;
                },
                Err(e) => return Err(e),
            }
        }
        
        current_population = next_population;
    }
    
    Ok(current_population)
}

pub fn compute_genetic_distance(alice: &AgentGenome, bob: &AgentGenome) -> f64 {
    let mut sum_sq = 0.0;
    // Simple Euclidean distance over all shared loci
    for alice_chrom in &alice.cognition.chromosomes {
        if let Some(bob_chrom) = bob.cognition.chromosomes.iter().find(|c| c.name == alice_chrom.name) {
            for alice_locus in &alice_chrom.loci {
                if let Some(bob_locus) = bob_chrom.loci.iter().find(|l| l.gene_name == alice_locus.gene_name) {
                    let diff = (alice_locus.value - bob_locus.value) as f64;
                    sum_sq += diff * diff;
                }
            }
        }
    }
    sum_sq.sqrt()
}

pub fn breed_genomes(
    alice: &AgentGenome,
    bob: &AgentGenome,
    child_name: &str,
    mappings: &[BreedingTraitMapping],
    strategy: &RecombinationStrategy,
    speciation_threshold: Option<f64>,
) -> Result<AgentGenome, String> {
    if mappings.is_empty() {
        return Err("breeding requires at least one measured trait target".to_string());
    }
    
    if let Some(threshold) = speciation_threshold {
        let distance = compute_genetic_distance(alice, bob);
        if distance > threshold {
            return Err(format!("BreedingStatus::Rejected: Genetic distance {:.3} exceeds speciation threshold {:.3}", distance, threshold));
        }
    }
    let mut child = alice.clone();
    child.id = GenomeId::new();
    child.parent_genome = None;
    child.parent_genomes = vec![alice.id.clone(), bob.id.clone()];
    child.identity.name = child_name.to_string();
    child.version = GenomeVersion("0.1.0".to_string());
    let mut changes = Vec::new();

    // Create a deterministic pseudo-random sequence for NHEJ based on parent IDs
    let mut hasher = DefaultHasher::new();
    alice.id.0.hash(&mut hasher);
    bob.id.0.hash(&mut hasher);
    let mut prng_state = hasher.finish();

    // Helper to get a pseudo-random f32 between 0 and 1
    let mut rand_f32 = || {
        prng_state = prng_state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (prng_state >> 32) as f32 / (std::u32::MAX as f32)
    };

    for chrom_index in 0..child.cognition.chromosomes.len() {
        let alice_chrom = &alice.cognition.chromosomes[chrom_index];
        if let Some(bob_chrom) = bob.cognition.chromosomes.iter().find(|c| c.name == alice_chrom.name) {
            
            let mut new_loci = Vec::new();
            let crossover_point = alice_chrom.loci.len() / 2;

            for (i, locus) in alice_chrom.loci.iter().enumerate() {
                let mut chosen_value = locus.value;
                let bob_val = bob_chrom.loci.iter().find(|l| l.gene_name == locus.gene_name).map(|l| l.value).unwrap_or(locus.value);

                match strategy {
                    RecombinationStrategy::HomologousRecombination => {
                        if i >= crossover_point {
                            chosen_value = bob_val;
                        }
                    }
                    RecombinationStrategy::GeneConversion { dominant_parent } => {
                        if dominant_parent == "alice" {
                            chosen_value = locus.value;
                        } else if dominant_parent == "bob" {
                            chosen_value = bob_val;
                        } else {
                            chosen_value = bob_val; // Default fallback
                        }
                    }
                    RecombinationStrategy::NonHomologousEndJoining { error_rate } => {
                        if i >= crossover_point {
                            chosen_value = bob_val;
                        }
                        // Introduces a random error based on deterministic PRNG
                        if rand_f32() < *error_rate {
                            let error = (rand_f32() - 0.5) * 0.2; // +/- 10% error
                            chosen_value = (chosen_value + error).clamp(0.0, 1.0);
                        }
                    }
                    RecombinationStrategy::SiteSpecific { target_genes } => {
                        if target_genes.contains(&locus.gene_name) {
                            // Exchange targeted genes from Bob
                            chosen_value = bob_val;
                        }
                    }
                }

                new_loci.push(genos_core::Locus { gene_name: locus.gene_name.clone(), value: chosen_value });
                
                changes.push(GenomeMutationChange {
                    field: format!("cognition.drives.{}", locus.gene_name),
                    previous_value: locus.value,
                    new_value: chosen_value,
                });
            }
            child.cognition.chromosomes[chrom_index].loci = new_loci;
        }
    }

    child.mutation = Some(GenomeMutationMetadata { changes });
    child.inferred_traits.clear();
    child.breeding = Some(GenomeBreedingMetadata {
        status: BreedingStatus::UntestedCandidate,
        targets: mappings
            .iter()
            .map(|mapping| {
                let drive_name = mapping.genome_field.strip_prefix("cognition.drives.").unwrap_or("");
                let actual_target = child.cognition.get_drive(drive_name).unwrap_or(mapping.target.target as f32) as f64;
                GenomeBreedingTarget {
                    trait_name: mapping.target.trait_name.clone(),
                    genome_field: mapping.genome_field.clone(),
                    target: actual_target,
                    parent_a_weight: mapping.target.parent_a_weight,
                    evaluation_suite: mapping.target.parent_a_estimate.evaluation_suite.clone(),
                }
            })
            .collect(),
    });
    Ok(child)
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingValidation {
    pub genome: AgentGenome,
    pub deviations: Vec<(String, f64)>,
    pub tolerance: f64,
}

pub fn validate_bred_child(
    child: &AgentGenome,
    phenotype: &PhenotypeObservation,
    tolerance: f64,
) -> Result<BreedingValidation, String> {
    let metadata = child
        .breeding
        .as_ref()
        .ok_or_else(|| "genome has no breeding metadata".to_string())?;
    if phenotype.genome_id != child.id {
        return Err("phenotype does not belong to child genome".to_string());
    }
    let mut deviations = Vec::new();
    for target in &metadata.targets {
        let observed = phenotype
            .traits
            .iter()
            .find(|value| value.name == target.trait_name)
            .ok_or_else(|| format!("missing child observation for {}", target.trait_name))?;
        deviations.push((
            target.trait_name.clone(),
            (observed.value - target.target).abs(),
        ));
    }
    let mut genome = child.clone();
    genome.breeding.as_mut().unwrap().status = if deviations
        .iter()
        .all(|(_, deviation)| *deviation <= tolerance)
    {
        BreedingStatus::Validated
    } else {
        BreedingStatus::Rejected
    };
    Ok(BreedingValidation {
        genome,
        deviations,
        tolerance,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchFinding {
    pub branch_id: genos_core::BranchId,
    pub claim: String,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SynthesisStatus {
    Proposed,
    Validated,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeSynthesisProposal {
    pub findings: Vec<BranchFinding>,
    pub validation_branch: Option<genos_core::BranchId>,
    pub status: SynthesisStatus,
}

pub fn synthesize_branch_knowledge(
    findings: Vec<BranchFinding>,
) -> Result<KnowledgeSynthesisProposal, String> {
    if findings.is_empty() || findings.iter().any(|finding| finding.evidence.is_empty()) {
        return Err("knowledge synthesis requires evidence-bearing findings".to_string());
    }
    Ok(KnowledgeSynthesisProposal {
        findings,
        validation_branch: None,
        status: SynthesisStatus::Proposed,
    })
}

pub fn validate_synthesis(
    proposal: &mut KnowledgeSynthesisProposal,
    validation_branch: genos_core::BranchId,
    passed: bool,
) {
    proposal.validation_branch = Some(validation_branch);
    proposal.status = if passed {
        SynthesisStatus::Validated
    } else {
        SynthesisStatus::Rejected
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{ObservedTrait, PhenotypeObservation};
    use genos_eval::TraitEstimate;

    fn dummy_genome() -> genos_core::AgentGenome {
        serde_json::from_str(r#"{
            "id": "test_id",
            "version": "1.0",
            "identity": { "name": "test", "role": "test" },
            "cognition": { "planning_depth": 1, "chromosomes": [] },
            "objectives": [],
            "policies": [],
            "capabilities": [],
            "memory_policy": { "working_max_items": 1, "episodic_enabled": false, "semantic_enabled": false },
            "model_policy": { "strategy": "default", "preferred_providers": [], "allow_local": true },
            "tool_policy": { "permissions": [] }
        }"#).unwrap()
    }

    fn phenotype(snapshot: &AgentSnapshot, treatment: &str, value: f64) -> HeredityCohortMember {
        HeredityCohortMember {
            treatment: treatment.to_string(),
            baseline: snapshot.clone(),
            phenotype: PhenotypeObservation {
                genome_id: snapshot.genome.id.clone(),
                evaluation_suite: "suite-v1".to_string(),
                model: "model-a".to_string(),
                environment: "sandbox".to_string(),
                measured_at: chrono::Utc::now(),
                traits: vec![ObservedTrait {
                    name: "verification".to_string(),
                    value,
                    confidence: 0.9,
                    observations: 50,
                    method: "tasks".to_string(),
                    evidence: vec![format!("eval:{treatment}")],
                }],
            },
        }
    }

    #[test]
    fn fixed_genome_cohort_measures_experience_range() {
        let parent = crate::test_support::snapshot();
        let a = genos_core::fork_snapshot(&parent);
        let b = genos_core::fork_snapshot(&parent);
        let controls = CohortControls {
            model: "model-a".to_string(),
            environment: "sandbox".to_string(),
            evaluation_suite: "suite-v1".to_string(),
            seed_policy: "paired".to_string(),
        };
        let report = analyze_fixed_genome_cohort(
            controls,
            &[
                phenotype(&a, "development", 0.8),
                phenotype(&b, "research", 0.6),
            ],
        )
        .unwrap();
        assert!((report.effects[0].range - 0.2).abs() < 1e-9);
    }

    #[test]
    fn breeding_records_both_parents_and_starts_without_inferred_claims() {
        let alice = crate::test_support::snapshot().genome;
        let mut bob = alice.clone();
        bob.id = GenomeId::new();
        let estimate = |mean| TraitEstimate {
            trait_name: "exploration".to_string(),
            mean,
            standard_error: 0.02,
            sample_size: 100,
            evaluation_suite: "traits-v1".to_string(),
        };
        let target =
            genos_eval::recombine_measured_trait(estimate(0.9), estimate(0.4), 0.5).unwrap();
        let child = breed_genomes(
            &alice,
            &bob,
            "charlie",
            &[BreedingTraitMapping {
                genome_field: "cognition.drives.exploration".to_string(),
                target,
            }],
            &genos_core::RecombinationStrategy::HomologousRecombination,
            None,
        )
        .unwrap();
        assert_eq!(child.parent_genomes, vec![alice.id, bob.id]);
        assert_eq!(child.identity.name, "charlie");
        assert_eq!(child.cognition.get_drive("exploration").unwrap(), 0.7);
        assert!(child.inferred_traits.is_empty());
    }

    #[test]
    fn safety_constraints_run_before_pareto_selection() {
        let candidate = |id: &str, risk: f64| SelectionCandidate {
            genome_id: GenomeId(id.to_string()),
            metrics: CanonicalAgentMetrics {
                accuracy: 0.9,
                cost: 1.0,
                tokens: 100.0,
                latency: 10.0,
                tool_calls: 2.0,
                risk,
                hallucinations: 0.01,
                novelty: 0.5,
                success: 0.9,
            },
        };
        let report = artificial_select(
            &[candidate("safe", 0.1), candidate("unsafe", 0.9)],
            &SelectionConstraints {
                max_cost: 2.0,
                max_risk: 0.2,
                max_hallucinations: 0.05,
                min_success: 0.8,
            },
        );
        assert_eq!(report.eligible, vec![GenomeId("safe".to_string())]);
        assert_eq!(report.rejected, vec![GenomeId("unsafe".to_string())]);
    }

    #[test]
    fn factorial_design_separates_genome_experience_and_interaction() {
        let observations = vec![
            FactorialTraitObservation {
                genome_id: GenomeId("g1".to_string()),
                treatment: "dev".to_string(),
                value: 0.9,
            },
            FactorialTraitObservation {
                genome_id: GenomeId("g1".to_string()),
                treatment: "research".to_string(),
                value: 0.7,
            },
            FactorialTraitObservation {
                genome_id: GenomeId("g2".to_string()),
                treatment: "dev".to_string(),
                value: 0.5,
            },
            FactorialTraitObservation {
                genome_id: GenomeId("g2".to_string()),
                treatment: "research".to_string(),
                value: 0.6,
            },
        ];
        let effects = analyze_genome_experience_interaction(&observations).unwrap();
        assert!(effects.genome_effect_range > 0.2);
        assert!(effects.maximum_interaction > 0.0);
    }

    #[test]
    fn child_validation_updates_breeding_status_from_observed_traits() {
        let alice = crate::test_support::snapshot().genome;
        let mut bob = alice.clone();
        bob.id = GenomeId::new();
        let estimate = |mean| TraitEstimate {
            trait_name: "exploration".to_string(),
            mean,
            standard_error: 0.02,
            sample_size: 100,
            evaluation_suite: "traits-v1".to_string(),
        };
        let target =
            genos_eval::recombine_measured_trait(estimate(0.9), estimate(0.4), 0.5).unwrap();
        let child = breed_genomes(
            &alice,
            &bob,
            "charlie",
            &[BreedingTraitMapping {
                genome_field: "cognition.drives.exploration".to_string(),
                target,
            }],
            &genos_core::RecombinationStrategy::HomologousRecombination,
            None,
        )
        .unwrap();
        assert_eq!(
            child.breeding.as_ref().unwrap().status,
            BreedingStatus::UntestedCandidate
        );
        let phenotype = PhenotypeObservation {
            genome_id: child.id.clone(),
            evaluation_suite: "traits-v1".to_string(),
            model: "m".to_string(),
            environment: "e".to_string(),
            measured_at: chrono::Utc::now(),
            traits: vec![ObservedTrait {
                name: "exploration".to_string(),
                value: 0.66,
                confidence: 0.9,
                observations: 100,
                method: "tasks".to_string(),
                evidence: vec!["eval:child".to_string()],
            }],
        };
        let validation = validate_bred_child(&child, &phenotype, 0.05).unwrap();
        assert_eq!(
            validation.genome.breeding.unwrap().status,
            BreedingStatus::Validated
        );
    }

    #[test]
    fn synthesis_requires_evidence_and_a_validation_branch() {
        let mut proposal = synthesize_branch_knowledge(vec![BranchFinding {
            branch_id: genos_core::BranchId("a".to_string()),
            claim: "hybrid is safer".to_string(),
            evidence: vec!["benchmark:1".to_string()],
        }])
        .unwrap();
        assert_eq!(proposal.status, SynthesisStatus::Proposed);
        validate_synthesis(
            &mut proposal,
            genos_core::BranchId("validation".to_string()),
            true,
        );
        assert_eq!(proposal.status, SynthesisStatus::Validated);
        assert!(proposal.validation_branch.is_some());
    }

    #[test]
    fn test_gene_conversion_dominant_alice() {
        let mut alice = dummy_genome();
        alice.id = genos_core::ids::GenomeId::new();
        alice.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.1 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.2 }] }];
        let mut bob = dummy_genome();
        bob.id = genos_core::ids::GenomeId::new();
        bob.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.9 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.8 }] }];

        let target = genos_eval::RecombinedTraitTarget { trait_name: "A".to_string(), target: 0.5, parent_a_weight: 0.5, parent_a_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() }, parent_b_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() } };

        let strategy = genos_core::RecombinationStrategy::GeneConversion { dominant_parent: "alice".to_string() };
        let child = breed_genomes(&alice, &bob, "child", &[BreedingTraitMapping { genome_field: "cognition.drives.A".to_string(), target }], &strategy, None).unwrap();
        assert_eq!(child.cognition.chromosomes[0].loci[0].value, 0.1);
        assert_eq!(child.cognition.chromosomes[0].loci[1].value, 0.2);
    }

    #[test]
    fn test_gene_conversion_dominant_bob() {
        let mut alice = dummy_genome();
        alice.id = genos_core::ids::GenomeId::new();
        alice.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.1 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.2 }] }];
        let mut bob = dummy_genome();
        bob.id = genos_core::ids::GenomeId::new();
        bob.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.9 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.8 }] }];

        let target = genos_eval::RecombinedTraitTarget { trait_name: "A".to_string(), target: 0.5, parent_a_weight: 0.5, parent_a_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() }, parent_b_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() } };

        let strategy = genos_core::RecombinationStrategy::GeneConversion { dominant_parent: "bob".to_string() };
        let child = breed_genomes(&alice, &bob, "child", &[BreedingTraitMapping { genome_field: "cognition.drives.A".to_string(), target }], &strategy, None).unwrap();
        assert_eq!(child.cognition.chromosomes[0].loci[0].value, 0.9);
        assert_eq!(child.cognition.chromosomes[0].loci[1].value, 0.8);
    }

    #[test]
    fn test_nhej_deterministic_prng() {
        let mut alice = dummy_genome();
        alice.id = genos_core::ids::GenomeId::new();
        alice.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.1 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.2 }] }];
        let mut bob = dummy_genome();
        bob.id = genos_core::ids::GenomeId::new();
        bob.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.9 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.8 }] }];

        let target1 = genos_eval::RecombinedTraitTarget { trait_name: "A".to_string(), target: 0.5, parent_a_weight: 0.5, parent_a_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() }, parent_b_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() } };
        let target2 = target1.clone();

        let strategy = genos_core::RecombinationStrategy::NonHomologousEndJoining { error_rate: 1.0 };
        let child1 = breed_genomes(&alice, &bob, "child1", &[BreedingTraitMapping { genome_field: "cognition.drives.A".to_string(), target: target1 }], &strategy, None).unwrap();
        let child2 = breed_genomes(&alice, &bob, "child2", &[BreedingTraitMapping { genome_field: "cognition.drives.A".to_string(), target: target2 }], &strategy, None).unwrap();

        assert_eq!(child1.cognition.chromosomes[0].loci[0].value, child2.cognition.chromosomes[0].loci[0].value);
        assert_eq!(child1.cognition.chromosomes[0].loci[1].value, child2.cognition.chromosomes[0].loci[1].value);
        assert_ne!(child1.cognition.chromosomes[0].loci[0].value, 0.1);
    }

    #[test]
    fn test_site_specific() {
        let mut alice = dummy_genome();
        alice.id = genos_core::ids::GenomeId::new();
        alice.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.1 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.2 }] }];
        let mut bob = dummy_genome();
        bob.id = genos_core::ids::GenomeId::new();
        bob.cognition.chromosomes = vec![genos_core::Chromosome { name: "C1".to_string(), loci: vec![genos_core::Locus { gene_name: "A".to_string(), value: 0.9 }, genos_core::Locus { gene_name: "B".to_string(), value: 0.8 }] }];

        let target = genos_eval::RecombinedTraitTarget { trait_name: "A".to_string(), target: 0.5, parent_a_weight: 0.5, parent_a_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() }, parent_b_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() } };

        let strategy = genos_core::RecombinationStrategy::SiteSpecific { target_genes: vec!["B".to_string()] };
        let child = breed_genomes(&alice, &bob, "child", &[BreedingTraitMapping { genome_field: "cognition.drives.A".to_string(), target }], &strategy, None).unwrap();
        assert_eq!(child.cognition.chromosomes[0].loci[0].value, 0.1);
        assert_eq!(child.cognition.chromosomes[0].loci[1].value, 0.8);
    }

    #[test]
    fn test_run_breeding_program_loop() {
        let mut alice = dummy_genome(); alice.id = GenomeId("gen_0_id_1".to_string());
        let mut bob = dummy_genome(); bob.id = GenomeId("gen_0_id_2".to_string());
        let mut charlie = dummy_genome(); charlie.id = GenomeId("gen_0_id_3".to_string());

        let initial_population = vec![alice, bob, charlie];
        let constraints = SelectionConstraints {
            max_cost: 100.0,
            max_risk: 100.0,
            max_hallucinations: 100.0,
            min_success: 0.0,
        };
        let strategy = genos_core::RecombinationStrategy::HomologousRecombination;
        let mappings = vec![BreedingTraitMapping {
            genome_field: "cognition.drives.A".to_string(),
            target: genos_eval::RecombinedTraitTarget {
                trait_name: "A".to_string(),
                target: 0.5,
                parent_a_weight: 0.5,
                parent_a_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() },
                parent_b_estimate: genos_eval::TraitEstimate { trait_name: "A".to_string(), mean: 0.5, standard_error: 0.1, sample_size: 1, evaluation_suite: "suite".to_string() },
            }
        }];

        let batch_evaluator = |pop: &[AgentGenome]| -> Vec<SelectionCandidate> {
            pop.iter().enumerate().map(|(i, g)| {
                SelectionCandidate {
                    genome_id: g.id.clone(),
                    metrics: CanonicalAgentMetrics {
                        accuracy: 0.5 + (i as f64 * 0.1),
                        cost: 10.0,
                        tokens: 1000.0,
                        latency: 1.0,
                        tool_calls: 1.0,
                        risk: 0.1,
                        hallucinations: 0.0,
                        novelty: 0.5,
                        success: 1.0,
                    }
                }
            }).collect()
        };

        let result = super::run_breeding_program(
            initial_population,
            &batch_evaluator,
            &constraints,
            &strategy,
            &mappings,
            5, // population size
            2, // generations
            0, // start generation
            None, // speciation threshold
        );

        assert!(result.is_ok());
        let final_pop = result.unwrap();
        for g in &final_pop { println!("genome in final_pop: {}", g.id.0); }
        assert_eq!(final_pop.len(), 5);
        // The elitism should retain the best parents and produce children.
        // Check that at least some genomes are from generation 2
        let has_gen_2 = final_pop.iter().any(|g| g.id.0.starts_with("gen_2"));
        assert!(has_gen_2);
    }
}
