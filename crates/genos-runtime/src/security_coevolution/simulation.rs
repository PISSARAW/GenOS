use genos_core::GenomeId;

use super::types::{
    MutationCandidate, SecurityCoevolutionConfig, SecurityGenes, SecurityGenome,
    SecurityGenomeMutation, SecurityPopulation, SecurityScenarioSpec,
};

pub struct SpawnContext<'a> {
    pub generation: u32,
    pub config: &'a SecurityCoevolutionConfig,
    pub seed: u64,
}

pub fn base_genome(
    scenario: &SecurityScenarioSpec,
    population: SecurityPopulation,
) -> SecurityGenome {
    let (prefix, tactic, genes) = match population {
        SecurityPopulation::Red => ("red", scenario.attack_tactic.clone(), scenario.red_genes),
        SecurityPopulation::Blue => ("blue", scenario.defense_tactic.clone(), scenario.blue_genes),
        SecurityPopulation::Observer => (
            "observer",
            "neutral_measurement".to_string(),
            SecurityGenes {
                effectiveness: 0.5,
                adaptability: 0.0,
                precision: 1.0,
            },
        ),
    };
    SecurityGenome {
        genome_id: GenomeId(format!("{prefix}-{}-G0", scenario.id)),
        parent_genome: None,
        population,
        tactic,
        genes,
        generation: 0,
        mutation: None,
    }
}

pub fn spawn_candidates(
    scenario: &SecurityScenarioSpec,
    parent: &SecurityGenome,
    ctx: SpawnContext<'_>,
) -> Vec<MutationCandidate> {
    (0..ctx.config.mutations_per_parent)
        .map(|mutation_index| {
            let mut genes = parent.genes;
            let selector = ((ctx.generation + mutation_index) % 3) as usize;
            let random = unit_random(ctx.seed, (ctx.generation, mutation_index), &parent.genome_id.0);
            let delta = (random * 2.0 - 1.0) * ctx.config.mutation_scale;
            let (field, previous, next) = apply_mutation_delta(&mut genes, selector, delta);

            let population = match parent.population {
                SecurityPopulation::Red => "red",
                SecurityPopulation::Blue => "blue",
                SecurityPopulation::Observer => "observer",
            };
            let genome = SecurityGenome {
                genome_id: GenomeId(format!(
                    "{population}-{}-G{:03}-M{}",
                    scenario.id,
                    ctx.generation,
                    mutation_index + 1
                )),
                parent_genome: Some(parent.genome_id.clone()),
                population: parent.population.clone(),
                tactic: parent.tactic.clone(),
                genes,
                generation: ctx.generation,
                mutation: Some(SecurityGenomeMutation {
                    field: field.to_string(),
                    previous_value: previous,
                    new_value: next,
                    delta: next - previous,
                }),
            };
            MutationCandidate {
                scenario_id: scenario.id.clone(),
                genome,
                fitness: 0.0,
                selected: false,
            }
        })
        .collect()
}

fn apply_mutation_delta(
    genes: &mut SecurityGenes,
    selector: usize,
    delta: f64,
) -> (&'static str, f64, f64) {
    match selector {
        0 => {
            let previous = genes.effectiveness;
            genes.effectiveness = (previous + delta).clamp(0.0, 1.0);
            ("effectiveness", previous, genes.effectiveness)
        }
        1 => {
            let previous = genes.adaptability;
            genes.adaptability = (previous + delta).clamp(0.0, 1.0);
            ("adaptability", previous, genes.adaptability)
        }
        _ => {
            let previous = genes.precision;
            genes.precision = (previous + delta).clamp(0.0, 1.0);
            ("precision", previous, genes.precision)
        }
    }
}

pub fn matchup(scenario: &SecurityScenarioSpec, red: &SecurityGenes, blue: &SecurityGenes) -> f64 {
    let attack = scenario.baseline_risk
        * (0.45 + 0.65 * red.effectiveness)
        * (0.85 + 0.25 * red.adaptability)
        * (0.90 + 0.20 * red.precision);
    let defense = 0.65 * blue.effectiveness + 0.20 * blue.adaptability + 0.15 * blue.precision;
    (attack * (1.15 - 0.85 * defense)).clamp(0.0, 1.0)
}

pub fn unit_random(seed: u64, step: (u32, u32), parent: &str) -> f64 {
    let (generation, mutation_index) = step;
    let parent_fold = parent.bytes().fold(0_u64, |state, byte| {
        state.wrapping_mul(131).wrapping_add(byte as u64)
    });
    let mut state = seed
        ^ parent_fold
        ^ (generation as u64).wrapping_mul(0x9E3779B97F4A7C15)
        ^ mutation_index as u64;
    state = state
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    ((state >> 11) as f64) / ((1_u64 << 53) as f64)
}
