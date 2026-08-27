use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use genos_core::{
    AgentGenome, BreedingStatus, GenomeBreedingMetadata, GenomeBreedingTarget, GenomeId,
    GenomeMutationChange, GenomeMutationMetadata, GenomeVersion, RecombinationStrategy,
};

use super::selection::artificial_select;
use super::selection::{select_parent, SelectionPool};
use super::types::{BreedingConfig, BreedingTraitMapping, SelectionCandidate};

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
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish() % 10000
}

pub fn compute_genetic_distance(alice: &AgentGenome, bob: &AgentGenome) -> f64 {
    let mut sum_sq = 0.0;
    for alice_chrom in &alice.cognition.chromosomes {
        if let Some(bob_chrom) = bob
            .cognition
            .chromosomes
            .iter()
            .find(|c| c.name == alice_chrom.name)
        {
            for alice_locus in &alice_chrom.loci {
                if let Some(bob_locus) = bob_chrom
                    .loci
                    .iter()
                    .find(|l| l.gene_name == alice_locus.gene_name)
                {
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
    lamarckian_mutations: &[genos_core::LamarckianMutation],
) -> Result<AgentGenome, String> {
    if mappings.is_empty() {
        return Err("breeding requires at least one measured trait target".to_string());
    }

    if let Some(threshold) = speciation_threshold {
        let distance = compute_genetic_distance(alice, bob);
        if distance > threshold {
            return Err(format!(
                "BreedingStatus::Rejected: Genetic distance {:.3} exceeds speciation threshold {:.3}",
                distance, threshold
            ));
        }
    }

    let mut child = alice.clone();
    child.id = GenomeId::new();
    child.parent_genome = None;
    child.parent_genomes = vec![alice.id.clone(), bob.id.clone()];
    child.identity.name = child_name.to_string();
    child.version = GenomeVersion("0.1.0".to_string());

    let mut hasher = DefaultHasher::new();
    alice.id.0.hash(&mut hasher);
    bob.id.0.hash(&mut hasher);
    let mut prng_state = hasher.finish();

    let mut changes = Vec::new();
    recombine_chromosomes(
        alice,
        bob,
        &mut child,
        RecombinationContext {
            strategy,
            prng_state: &mut prng_state,
            changes: &mut changes,
        },
    );

    for mut_req in lamarckian_mutations {
        for chrom in &mut child.cognition.chromosomes {
            for locus in &mut chrom.loci {
                if locus.gene_name == mut_req.target_gene {
                    locus.epigenetic_marker = mut_req.epigenetic_marker;
                }
            }
        }
    }

    child.mutation = Some(GenomeMutationMetadata { changes });
    child.inferred_traits.clear();
    child.breeding = Some(build_breeding_metadata(&child, mappings));
    Ok(child)
}

struct RecombinationContext<'a> {
    strategy: &'a RecombinationStrategy,
    prng_state: &'a mut u64,
    changes: &'a mut Vec<GenomeMutationChange>,
}

fn recombine_chromosomes(
    alice: &AgentGenome,
    bob: &AgentGenome,
    child: &mut AgentGenome,
    ctx: RecombinationContext<'_>,
) {
    for chrom_index in 0..child.cognition.chromosomes.len() {
        let alice_chrom = &alice.cognition.chromosomes[chrom_index];
        if let Some(bob_chrom) = bob
            .cognition
            .chromosomes
            .iter()
            .find(|c| c.name == alice_chrom.name)
        {
            let mut new_loci = Vec::new();
            let locus_count = alice_chrom.loci.len();

            // Sélection du schéma de cassures selon la stratégie.
            let default_crossover_point = locus_count / 2;
            let is_bob_segment = |strategy: &RecombinationStrategy, i: usize| -> bool {
                match strategy {
                    // Multi-points : les segments alternent entre les parents.
                    RecombinationStrategy::MultiPointCrossover { points } => {
                        let p = (*points).max(1) as usize;
                        (i * p / locus_count.max(1)) % 2 == 1
                    }
                    _ => i >= default_crossover_point,
                }
            };

            for (i, locus) in alice_chrom.loci.iter().enumerate() {
                let bob_locus = bob_chrom
                    .loci
                    .iter()
                    .find(|l| l.gene_name == locus.gene_name)
                    .unwrap_or(locus);

                let mut chosen_locus = calculate_recombined_locus(
                    locus,
                    bob_locus,
                    is_bob_segment(ctx.strategy, i),
                    ctx.strategy,
                    ctx.prng_state,
                );

                // HÃ©rÃ©ditÃ© Lamarckienne avec dissipation Ã©pigÃ©nÃ©tique (ex: 70% conservÃ©)
                chosen_locus.epigenetic_marker *= 0.7;

                let chosen_value = chosen_locus.value;
                new_loci.push(chosen_locus);

                ctx.changes.push(GenomeMutationChange {
                    field: format!("cognition.drives.{}", locus.gene_name),
                    previous_value: locus.value,
                    new_value: chosen_value,
                });
            }
            child.cognition.chromosomes[chrom_index].loci = new_loci;
        }
    }
}

pub(crate) use super::recombination::calculate_recombined_locus;

fn build_breeding_metadata(
    child: &AgentGenome,
    mappings: &[BreedingTraitMapping],
) -> GenomeBreedingMetadata {
    GenomeBreedingMetadata {
        status: BreedingStatus::UntestedCandidate,
        targets: mappings
            .iter()
            .map(|mapping| {
                let drive_name = mapping
                    .genome_field
                    .strip_prefix("cognition.drives.")
                    .unwrap_or("");
                let actual_target = child
                    .cognition
                    .get_drive(drive_name)
                    .unwrap_or(mapping.target.target as f32)
                    as f64;
                GenomeBreedingTarget {
                    trait_name: mapping.target.trait_name.clone(),
                    genome_field: mapping.genome_field.clone(),
                    target: actual_target,
                    parent_a_weight: mapping.target.parent_a_weight,
                    evaluation_suite: mapping.target.parent_a_estimate.evaluation_suite.clone(),
                }
            })
            .collect(),
    }
}

/// Boucle principale de l'Élevage Multi-Générationnel (Algorithme Génétique Automatisé).
/// Évalue la population actuelle via `batch_evaluator`, sélectionne les meilleurs candidats selon
/// les contraintes de `config`, puis utilise les stratégies de sélection parentale et de recombinaison
/// pour produire la génération suivante.
pub fn run_breeding_program<E>(
    mut current_population: Vec<AgentGenome>,
    config: &BreedingConfig,
    batch_evaluator: &E,
) -> Result<Vec<AgentGenome>, String>
where
    E: Fn(&[AgentGenome]) -> Vec<SelectionCandidate>,
{
    if current_population.is_empty() {
        return Err("Initial population cannot be empty".to_string());
    }

    let mut hasher = DefaultHasher::new();
    "breeding_program".hash(&mut hasher);
    let mut rand_f32 = || {
        hasher.write_u8(0);
        (hasher.finish() % 1000) as f32 / 1000.0
    };

    for gen in 0..config.generations {
        let current_gen_num = config.start_generation + gen;
        let candidates = batch_evaluator(&current_population);
        let report = artificial_select(&candidates, &config.selection_constraints);

        let mut non_dominated_ids = Vec::new();
        for assessment in &report.pareto {
            if assessment.status == genos_eval::ParetoStatus::NonDominated {
                non_dominated_ids.push(GenomeId(assessment.branch_id.0.clone()));
            }
        }

        if non_dominated_ids.is_empty() {
            return Err(format!(
                "Extinction at generation {} - no candidates survived constraints or pareto selection",
                current_gen_num
            ));
        }

        let mut next_population = Vec::new();
        let mut non_dominated_genomes = Vec::new();
        let mut eligible_genomes = Vec::new();
        let mut eligible_candidates = Vec::new();

        for genome in &current_population {
            if report.eligible.contains(&genome.id) {
                eligible_genomes.push(genome.clone());
                if let Some(cand) = candidates.iter().find(|c| c.genome_id == genome.id) {
                    eligible_candidates.push(cand.clone());
                }
            }
            if non_dominated_ids.contains(&genome.id) {
                non_dominated_genomes.push(genome.clone());
            }
        }

        let elites = config.elitism_count.min(non_dominated_genomes.len());
        for elite in &non_dominated_genomes[..elites] {
            next_population.push(elite.clone());
        }

        let pool = SelectionPool {
            genomes: &eligible_genomes,
            candidates: &eligible_candidates,
            non_dominated: &non_dominated_genomes,
        };

        let mut children_produced = 0;
        while next_population.len() < config.population_size {
            let alice = select_parent(&pool, &config.selection_strategy, &mut rand_f32);
            let bob = select_parent(&pool, &config.selection_strategy, &mut rand_f32);

            let k1 = extract_numeric_id(&alice.id);
            let k2 = extract_numeric_id(&bob.id);
            let child_num_id = cantor_pairing(k1, k2);
            let child_name = format!(
                "gen_{}_id_{}",
                current_gen_num + 1,
                child_num_id + children_produced as u64
            );

            match breed_genomes(
                alice,
                bob,
                &child_name,
                &config.trait_mappings,
                &config.recombination_strategy,
                config.speciation_threshold,
                &[],
            ) {
                Ok(mut child) => {
                    if config.mutation_rate > 0.0 {
                        for chrom in &mut child.cognition.chromosomes {
                            for locus in &mut chrom.loci {
                                if rand_f32() < config.mutation_rate {
                                    let error = (rand_f32() - 0.5) * config.mutation_variance;
                                    locus.value = (locus.value + error).clamp(0.0, 1.0);
                                    locus.epigenetic_marker =
                                        (locus.epigenetic_marker + error).clamp(0.0, 1.0);
                                }
                            }
                        }
                    }
                    child.id = genos_core::GenomeId(child_name);
                    next_population.push(child);
                    children_produced += 1;
                }
                Err(e) if e.contains("Rejected") => continue,
                Err(e) => return Err(e),
            }
        }

        current_population = next_population;
    }

    Ok(current_population)
}
