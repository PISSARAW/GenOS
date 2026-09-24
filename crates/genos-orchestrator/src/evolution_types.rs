//! Types auxiliaires pour l'évolution multi-îlots.
//!
//! Ces types sont extraits de `evolution.rs` pour respecter la limite
//! de 400 lignes par fichier.

use std::collections::HashSet;
use std::f64::consts::PI;

/// Un individu : génotype + fitness évaluée par l'environnement.
#[derive(Clone, Debug)]
pub struct Individual {
    pub id: u64,
    pub genes: Vec<f64>,
    pub fitness_info: FitnessInfo,
}

#[derive(Clone, Debug)]
pub struct FitnessInfo {
    pub fitness: f64,
    pub lineage: u64,
}

/// Preuve minimale qu'une innovation peut entrer en compétition.
#[derive(Clone, Debug)]
pub struct QualityProof {
    pub fitness: f64,
    pub quality: f64,
    pub proof_flags: ProofFlags,
}

#[derive(Clone, Debug)]
pub struct ProofFlags {
    pub reproducible: bool,
    pub regression_free: bool,
}

/// Params pour la création d'une population initiale.
pub struct PopulationConfig<'a> {
    pub names: &'a [&'a str],
    pub island_config: IslandConfig,
    pub seed: u64,
}

pub struct IslandConfig {
    pub per_island: usize,
    pub gene_count: usize,
}

/// Bilan d'une génération.
#[derive(Clone, Debug)]
pub struct EvolutionReport {
    pub generation: u64,
    pub best_fitness: f64,
    pub mean_fitness: f64,
    pub stats: EvolutionStats,
}

#[derive(Clone, Debug)]
pub struct EvolutionStats {
    pub novelty_count: usize,
    pub population: usize,
    pub verified_count: usize,
    pub rejected_count: usize,
}

/// Population multi-îlots évolutive.
pub struct Population {
    pub islands: Vec<Island>,
    pub evolution_config: EvolutionConfig,
    pub generation_state: GenerationState,
    pub novelty_state: NoveltyState,
}

pub struct EvolutionConfig {
    pub mutation_rate: f64,
    pub per_island: usize,
    seed: u64,
}

pub struct GenerationState {
    pub generation: u64,
    pub next_id: u64,
}

pub struct NoveltyState {
    pub novelty: HashSet<Vec<i16>>,
    pub last_quality_counts: Option<(usize, usize)>,
}

/// Un îlot (patch) de population.
#[derive(Clone, Debug)]
pub struct Island {
    pub name: String,
    pub individuals: Vec<Individual>,
}

impl Population {
    /// Crée une population initiale (génotypes aléatoires déterministes).
    pub fn new(config: PopulationConfig<'_>) -> Self {
        let mut population = Self {
            islands: Vec::new(),
            evolution_config: EvolutionConfig {
                mutation_rate: 0.2,
                per_island: config.island_config.per_island,
                seed: config.seed,
            },
            generation_state: GenerationState {
                generation: 0,
                next_id: 0,
            },
            novelty_state: NoveltyState {
                novelty: HashSet::new(),
                last_quality_counts: None,
            },
        };
        for name in config.names {
            let spawn_cfg = SpawnConfig {
                gene_count: config.island_config.gene_count,
                parent_a: None,
                parent_b: None,
            };
            let individuals = (0..config.island_config.per_island)
                .map(|_| population.spawn(&spawn_cfg))
                .collect();
            population.islands.push(Island {
                name: name.to_string(),
                individuals,
            });
        }
        population
    }

    pub fn next_u64(&mut self) -> u64 {
        self.evolution_config.seed = self
            .evolution_config
            .seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.evolution_config.seed
    }

    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    pub fn gaussian(&mut self) -> f64 {
        let u1 = self.next_f64().max(1e-12);
        let u2 = self.next_f64();
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }

    pub fn spawn(&mut self, config: &SpawnConfig<'_>) -> Individual {
        let id = self.generation_state.next_id;
        self.generation_state.next_id += 1;
        let genes: Vec<f64> = match (config.parent_a, config.parent_b) {
            (Some(a), Some(b)) => {
                let rate = self.evolution_config.mutation_rate;
                (0..config.gene_count)
                    .map(|i| {
                        let base = if self.next_f64() < 0.5 {
                            a.genes[i]
                        } else {
                            b.genes[i]
                        };
                        if self.next_f64() < rate {
                            base + self.gaussian() * 0.2
                        } else {
                            base
                        }
                    })
                    .collect()
            }
            _ => (0..config.gene_count)
                .map(|_| self.next_f64() * 2.0 - 1.0)
                .collect(),
        };
        Individual {
            id,
            genes,
            fitness_info: FitnessInfo {
                fitness: 0.0,
                lineage: config
                    .parent_a
                    .map(|p| p.fitness_info.lineage)
                    .unwrap_or(id),
            },
        }
    }
}

/// Params pour créer un individu (spawn).
pub struct SpawnConfig<'a> {
    pub gene_count: usize,
    pub parent_a: Option<&'a Individual>,
    pub parent_b: Option<&'a Individual>,
}
