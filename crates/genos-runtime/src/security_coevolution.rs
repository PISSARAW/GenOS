use anyhow::bail;
use chrono::{Duration, Utc};
use genos_core::{GenomeId, LineageDag, LineageEdge, LineageRelation, SnapshotId};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityGenes {
    /// Offensive pressure for Red; detection coverage for Blue.
    pub effectiveness: f64,
    /// Ability to respond to the opposing population.
    pub adaptability: f64,
    /// Stealth for Red; alert precision for Blue.
    pub precision: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityScenarioSpec {
    pub id: String,
    pub attack_tactic: String,
    pub defense_tactic: String,
    pub baseline_risk: f64,
    pub red_genes: SecurityGenes,
    pub blue_genes: SecurityGenes,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityCoevolutionConfig {
    pub seed: u64,
    pub generations: u32,
    pub mutations_per_parent: u32,
    pub mutation_scale: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityCoevolutionManifest {
    pub name: String,
    pub snapshot_ref: String,
    pub scenarios: Vec<SecurityScenarioSpec>,
    pub config: SecurityCoevolutionConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityPopulation {
    Red,
    Blue,
    Observer,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityGenome {
    pub genome_id: GenomeId,
    pub parent_genome: Option<GenomeId>,
    pub population: SecurityPopulation,
    pub tactic: String,
    pub genes: SecurityGenes,
    pub generation: u32,
    pub mutation: Option<SecurityGenomeMutation>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityGenomeMutation {
    pub field: String,
    pub previous_value: f64,
    pub new_value: f64,
    pub delta: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityWorld {
    pub world_id: String,
    pub parent_snapshot: SnapshotId,
    pub scenario_id: String,
    pub red: SecurityGenome,
    pub blue: SecurityGenome,
    pub observer: SecurityGenome,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MutationCandidate {
    pub scenario_id: String,
    pub genome: SecurityGenome,
    pub fitness: f64,
    pub selected: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObserverFinding {
    pub scenario_id: String,
    pub world_id: String,
    pub generation: u32,
    pub red_genome_id: GenomeId,
    pub blue_genome_id: GenomeId,
    pub breach_probability: f64,
    pub defense_utility: f64,
    pub false_positive_cost: f64,
    pub arms_race_delta: f64,
    pub observation: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CoevolutionGeneration {
    pub scenario_id: String,
    pub generation: u32,
    pub red_candidates: Vec<MutationCandidate>,
    pub blue_candidates: Vec<MutationCandidate>,
    pub selected_red: GenomeId,
    pub selected_blue: GenomeId,
    pub observer_finding: ObserverFinding,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityCoevolutionReport {
    pub name: String,
    pub snapshot_ref: String,
    pub generations_requested: u32,
    pub initial_worlds: Vec<SecurityWorld>,
    pub evolution: Vec<CoevolutionGeneration>,
    pub final_worlds: Vec<SecurityWorld>,
    pub world_lineage: LineageDag,
    pub total_genomes_evaluated: usize,
}

/// Run an abstract, deterministic Red/Blue coevolution. It deliberately models
/// capabilities as normalized genes and never executes attack payloads,
/// network requests or changes to a real target.
pub fn run_security_coevolution(
    manifest: SecurityCoevolutionManifest,
) -> anyhow::Result<SecurityCoevolutionReport> {
    validate(&manifest)?;
    let root = SnapshotId(manifest.snapshot_ref.clone());
    let created_at = Utc::now();
    let mut world_lineage = LineageDag::default();
    let mut initial_worlds = Vec::new();

    for (index, scenario) in manifest.scenarios.iter().enumerate() {
        let world_id = format!("security-world-{}", scenario.id);
        let world_snapshot = SnapshotId(world_id.clone());
        world_lineage.edges.push(LineageEdge {
            parent_snapshot: root.clone(),
            child_snapshot: world_snapshot,
            relation: LineageRelation::Fork,
            created_at: created_at + Duration::milliseconds(index as i64),
            metadata: json!({
                "scenario": scenario.id,
                "attack_tactic": scenario.attack_tactic,
                "defense_tactic": scenario.defense_tactic,
                "isolated": true,
            }),
        });
        initial_worlds.push(SecurityWorld {
            world_id,
            parent_snapshot: root.clone(),
            scenario_id: scenario.id.clone(),
            red: base_genome(scenario, SecurityPopulation::Red),
            blue: base_genome(scenario, SecurityPopulation::Blue),
            observer: base_genome(scenario, SecurityPopulation::Observer),
        });
    }

    let mut final_worlds = initial_worlds.clone();
    let mut evolution = Vec::new();
    let mut total_genomes_evaluated = initial_worlds.len() * 3;
    for (scenario_index, scenario) in manifest.scenarios.iter().enumerate() {
        let world = &mut final_worlds[scenario_index];
        let mut previous_breach = matchup(scenario, &world.red.genes, &world.blue.genes);
        for generation in 1..=manifest.config.generations {
            let mut red_candidates = spawn_candidates(
                scenario,
                &world.red,
                generation,
                &manifest.config,
                manifest.config.seed ^ scenario_index as u64,
            );
            for candidate in &mut red_candidates {
                candidate.fitness = matchup(scenario, &candidate.genome.genes, &world.blue.genes);
            }
            let selected_red_index = red_candidates
                .iter()
                .enumerate()
                .max_by(|(_, left), (_, right)| {
                    left.fitness
                        .total_cmp(&right.fitness)
                        .then_with(|| right.genome.genome_id.0.cmp(&left.genome.genome_id.0))
                })
                .map(|(index, _)| index)
                .expect("validated non-empty mutations");
            red_candidates[selected_red_index].selected = true;
            let selected_red = red_candidates[selected_red_index].genome.clone();

            let mut blue_candidates = spawn_candidates(
                scenario,
                &world.blue,
                generation,
                &manifest.config,
                manifest.config.seed ^ 0xB10E ^ scenario_index as u64,
            );
            for candidate in &mut blue_candidates {
                let breach = matchup(scenario, &selected_red.genes, &candidate.genome.genes);
                let false_positive_cost = (1.0 - candidate.genome.genes.precision) * 0.2;
                candidate.fitness = (1.0 - breach - false_positive_cost).clamp(0.0, 1.0);
            }
            let selected_blue_index = blue_candidates
                .iter()
                .enumerate()
                .max_by(|(_, left), (_, right)| {
                    left.fitness
                        .total_cmp(&right.fitness)
                        .then_with(|| right.genome.genome_id.0.cmp(&left.genome.genome_id.0))
                })
                .map(|(index, _)| index)
                .expect("validated non-empty mutations");
            blue_candidates[selected_blue_index].selected = true;
            let selected_blue = blue_candidates[selected_blue_index].genome.clone();

            let breach = matchup(scenario, &selected_red.genes, &selected_blue.genes);
            let false_positive_cost = (1.0 - selected_blue.genes.precision) * 0.2;
            let defense_utility = (1.0 - breach - false_positive_cost).clamp(0.0, 1.0);
            let observer_finding = ObserverFinding {
                scenario_id: scenario.id.clone(),
                world_id: world.world_id.clone(),
                generation,
                red_genome_id: selected_red.genome_id.clone(),
                blue_genome_id: selected_blue.genome_id.clone(),
                breach_probability: breach,
                defense_utility,
                false_positive_cost,
                arms_race_delta: breach - previous_breach,
                observation: if breach > previous_breach {
                    "red adaptation outpaced the current defense".to_string()
                } else {
                    "blue adaptation contained the current attack".to_string()
                },
            };
            previous_breach = breach;
            total_genomes_evaluated += red_candidates.len() + blue_candidates.len();
            evolution.push(CoevolutionGeneration {
                scenario_id: scenario.id.clone(),
                generation,
                selected_red: selected_red.genome_id.clone(),
                selected_blue: selected_blue.genome_id.clone(),
                red_candidates,
                blue_candidates,
                observer_finding,
            });
            world.red = selected_red;
            world.blue = selected_blue;
        }
    }

    Ok(SecurityCoevolutionReport {
        name: manifest.name,
        snapshot_ref: manifest.snapshot_ref,
        generations_requested: manifest.config.generations,
        initial_worlds,
        evolution,
        final_worlds,
        world_lineage,
        total_genomes_evaluated,
    })
}

fn validate(manifest: &SecurityCoevolutionManifest) -> anyhow::Result<()> {
    if manifest.scenarios.is_empty()
        || manifest.config.generations == 0
        || manifest.config.mutations_per_parent == 0
        || !(0.0..=1.0).contains(&manifest.config.mutation_scale)
    {
        bail!("invalid security coevolution configuration");
    }
    for scenario in &manifest.scenarios {
        if !(0.0..=1.0).contains(&scenario.baseline_risk) {
            bail!("scenario {} has invalid baseline risk", scenario.id);
        }
        for value in [
            scenario.red_genes.effectiveness,
            scenario.red_genes.adaptability,
            scenario.red_genes.precision,
            scenario.blue_genes.effectiveness,
            scenario.blue_genes.adaptability,
            scenario.blue_genes.precision,
        ] {
            if !(0.0..=1.0).contains(&value) {
                bail!("scenario {} has a gene outside [0, 1]", scenario.id);
            }
        }
    }
    Ok(())
}

fn base_genome(scenario: &SecurityScenarioSpec, population: SecurityPopulation) -> SecurityGenome {
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

fn spawn_candidates(
    scenario: &SecurityScenarioSpec,
    parent: &SecurityGenome,
    generation: u32,
    config: &SecurityCoevolutionConfig,
    seed: u64,
) -> Vec<MutationCandidate> {
    (0..config.mutations_per_parent)
        .map(|mutation_index| {
            let mut genes = parent.genes;
            let selector = ((generation + mutation_index) % 3) as usize;
            let random = unit_random(seed, generation, mutation_index, &parent.genome_id.0);
            let delta = (random * 2.0 - 1.0) * config.mutation_scale;
            let (field, previous, next) = match selector {
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
            };
            let population = match parent.population {
                SecurityPopulation::Red => "red",
                SecurityPopulation::Blue => "blue",
                SecurityPopulation::Observer => "observer",
            };
            let genome = SecurityGenome {
                genome_id: GenomeId(format!(
                    "{population}-{}-G{generation:03}-M{}",
                    scenario.id,
                    mutation_index + 1
                )),
                parent_genome: Some(parent.genome_id.clone()),
                population: parent.population.clone(),
                tactic: parent.tactic.clone(),
                genes,
                generation,
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

fn matchup(scenario: &SecurityScenarioSpec, red: &SecurityGenes, blue: &SecurityGenes) -> f64 {
    let attack = scenario.baseline_risk
        * (0.45 + 0.65 * red.effectiveness)
        * (0.85 + 0.25 * red.adaptability)
        * (0.90 + 0.20 * red.precision);
    let defense = 0.65 * blue.effectiveness + 0.20 * blue.adaptability + 0.15 * blue.precision;
    (attack * (1.15 - 0.85 * defense)).clamp(0.0, 1.0)
}

fn unit_random(seed: u64, generation: u32, mutation_index: u32, parent: &str) -> f64 {
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
