//! Évolution ouverte : population multi-îlots, sélection, reproduction,
//! nouveauté et migration.
//!
//! Chaque individu porte un **génotype** numérique ; la fitness est fournie par
//! l'**environnement** (fermeture). La sélection est un tournoi, la reproduction
//! combine croisement uniforme + mutation, et un **archive de nouveauté**
//! récompense les phénotypes inédits. Les îlots échangent leurs meilleurs
//! individus (métapopulation).

use std::collections::HashSet;
use std::f64::consts::PI;

/// Un individu : génotype + fitness évaluée par l'environnement.
#[derive(Clone, Debug)]
pub struct Individual {
    pub id: u64,
    pub genes: Vec<f64>,
    pub fitness: f64,
    pub lineage: u64,
}

/// Preuve minimale qu'une innovation peut entrer en compétition.
#[derive(Clone, Debug)]
pub struct QualityProof {
    pub fitness: f64,
    pub quality: f64,
    pub reproducible: bool,
    pub regression_free: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InnovationBlocked {
    NoVerifiedCandidate,
}

/// Un îlot (patch) de population.
#[derive(Clone, Debug)]
pub struct Island {
    pub name: String,
    pub individuals: Vec<Individual>,
}

/// Bilan d'une génération.
#[derive(Clone, Debug)]
pub struct EvolutionReport {
    pub generation: u64,
    pub best_fitness: f64,
    pub mean_fitness: f64,
    pub novelty_count: usize,
    pub population: usize,
    pub verified_count: usize,
    pub rejected_count: usize,
}

/// Population multi-îlots évolutive.
pub struct Population {
    pub islands: Vec<Island>,
    pub novelty: HashSet<Vec<i16>>,
    pub generation: u64,
    pub next_id: u64,
    seed: u64,
    pub mutation_rate: f64,
    pub per_island: usize,
    last_quality_counts: Option<(usize, usize)>,
}

impl Population {
    /// Crée une population initiale (génotypes aléatoires déterministes).
    pub fn new(names: &[&str], per_island: usize, gene_count: usize, seed: u64) -> Self {
        let mut population = Self {
            islands: Vec::new(),
            novelty: HashSet::new(),
            generation: 0,
            next_id: 0,
            seed,
            mutation_rate: 0.2,
            per_island,
            last_quality_counts: None,
        };
        for name in names {
            let individuals = (0..per_island)
                .map(|_| population.spawn(gene_count, None, None))
                .collect();
            population.islands.push(Island {
                name: name.to_string(),
                individuals,
            });
        }
        population
    }

    fn next_u64(&mut self) -> u64 {
        self.seed = self
            .seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.seed
    }

    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    fn gaussian(&mut self) -> f64 {
        let u1 = self.next_f64().max(1e-12);
        let u2 = self.next_f64();
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }

    fn spawn(
        &mut self,
        gene_count: usize,
        parent_a: Option<&Individual>,
        parent_b: Option<&Individual>,
    ) -> Individual {
        let id = self.next_id;
        self.next_id += 1;
        let genes: Vec<f64> = match (parent_a, parent_b) {
            (Some(a), Some(b)) => {
                let rate = self.mutation_rate;
                (0..gene_count)
                    .map(|i| {
                        let base = if self.next_f64() < 0.5 { a.genes[i] } else { b.genes[i] };
                        if self.next_f64() < rate {
                            base + self.gaussian() * 0.2
                        } else {
                            base
                        }
                    })
                    .collect()
            }
            _ => (0..gene_count)
                .map(|_| self.next_f64() * 2.0 - 1.0)
                .collect(),
        };
        Individual {
            id,
            genes,
            fitness: 0.0,
            lineage: parent_a.map(|p| p.lineage).unwrap_or(id),
        }
    }

    /// Évalue tous les individus via la fitness fournie par l'environnement.
    pub fn evaluate(&mut self, fitness: &dyn Fn(&[f64]) -> f64) {
        for island in &mut self.islands {
            for individual in &mut island.individuals {
                individual.fitness = fitness(&individual.genes);
            }
        }
    }

    /// Évalue une innovation et ne laisse se reproduire que les candidats
    /// soutenus par une preuve de qualité, reproductibilité et absence de
    /// régression.
    pub fn innovation_step(
        &mut self,
        evaluator: &dyn Fn(&[f64]) -> QualityProof,
        min_quality: f64,
    ) -> Result<EvolutionReport, InnovationBlocked> {
        let mut verified = 0;
        let mut rejected = 0;
        for island in &mut self.islands {
            for individual in &mut island.individuals {
                let proof = evaluator(&individual.genes);
                let accepted = proof.fitness.is_finite()
                    && proof.quality.is_finite()
                    && proof.quality >= min_quality
                    && proof.reproducible
                    && proof.regression_free;
                if accepted {
                    individual.fitness = proof.fitness + proof.quality * 0.1;
                    verified += 1;
                } else {
                    individual.fitness = f64::NEG_INFINITY;
                    rejected += 1;
                }
            }
        }
        if verified == 0 {
            self.last_quality_counts = Some((0, rejected));
            return Err(InnovationBlocked::NoVerifiedCandidate);
        }
        self.generation();
        self.last_quality_counts = Some((verified, rejected));
        Ok(self.report())
    }

    /// Bonus de nouveauté : 1.0 si le phénotype (génotype quantifié) est inédit.
    pub fn novelty_of(&mut self, genes: &[f64]) -> f64 {
        let key: Vec<i16> = genes
            .iter()
            .map(|g| (g * 100.0).round().clamp(-30000.0, 30000.0) as i16)
            .collect();
        if self.novelty.insert(key) {
            1.0
        } else {
            0.0
        }
    }

    /// Une génération : nouveauté + sélection par tournoi + reproduction.
    pub fn generation(&mut self) {
        // Nouveauté.
        let novelty_weight = 0.3;
        for island_index in 0..self.islands.len() {
            let keys: Vec<Vec<f64>> = self.islands[island_index]
                .individuals
                .iter()
                .map(|i| i.genes.clone())
                .collect();
            let bonuses: Vec<f64> = keys.iter().map(|genes| self.novelty_of(genes)).collect();
            for (index, bonus) in bonuses.into_iter().enumerate() {
                self.islands[island_index].individuals[index].fitness += novelty_weight * bonus;
            }
        }
        // Sélection + reproduction par îlot.
        for island_index in 0..self.islands.len() {
            let gene_count = self.islands[island_index]
                .individuals
                .first()
                .map(|i| i.genes.len())
                .unwrap_or(0);
            self.islands[island_index]
                .individuals
                .sort_by(|a, b| b.fitness.partial_cmp(&a.fitness).unwrap_or(std::cmp::Ordering::Equal));
            let mut next: Vec<Individual> = self.islands[island_index]
                .individuals
                .first()
                .cloned()
                .into_iter()
                .collect();
            while next.len() < self.per_island {
                let (a, b) = self.tournament(island_index);
                let child = self.spawn(gene_count, Some(&a), Some(&b));
                next.push(child);
            }
            self.islands[island_index].individuals = next;
        }
        // Migration en anneau (métapopulation).
        if self.generation % 3 == 2 && self.islands.len() > 1 {
            self.migrate();
        }
        self.generation += 1;
    }

    fn tournament(&mut self, island_index: usize) -> (Individual, Individual) {
        let len = self.islands[island_index].individuals.len();
        let a = self.tournament_pick(island_index, len);
        let b = self.tournament_pick(island_index, len);
        (a, b)
    }

    fn tournament_pick(&mut self, island_index: usize, len: usize) -> Individual {
        let eligible: Vec<usize> = self.islands[island_index]
            .individuals
            .iter()
            .enumerate()
            .filter_map(|(index, individual)| individual.fitness.is_finite().then_some(index))
            .collect();
        let pool = if eligible.is_empty() {
            (0..len).collect()
        } else {
            eligible
        };
        let i = pool[(self.next_u64() as usize) % pool.len()];
        let j = pool[(self.next_u64() as usize) % pool.len()];
        let island = &self.islands[island_index];
        if island.individuals[i].fitness >= island.individuals[j].fitness {
            island.individuals[i].clone()
        } else {
            island.individuals[j].clone()
        }
    }

    /// Échange le meilleur de chaque îlot avec le pire de l'îlot suivant.
    pub fn migrate(&mut self) {
        let n = self.islands.len();
        if n < 2 {
            return;
        }
        let migrants: Vec<Individual> = (0..n)
            .map(|i| {
                self.islands[i]
                    .individuals
                    .iter()
                    .max_by(|a, b| a.fitness.partial_cmp(&b.fitness).unwrap_or(std::cmp::Ordering::Equal))
                    .cloned()
                    .expect("ile non vide")
            })
            .collect();
        for (i, migrant) in migrants.into_iter().enumerate() {
            let target = (i + 1) % n;
            let individuals = &mut self.islands[target].individuals;
            if let Some(worst) = individuals
                .iter_mut()
                .min_by(|a, b| a.fitness.partial_cmp(&b.fitness).unwrap_or(std::cmp::Ordering::Equal))
            {
                *worst = migrant;
            }
        }
    }

    pub fn best(&self) -> Option<&Individual> {
        self.islands
            .iter()
            .flat_map(|island| island.individuals.iter())
            .max_by(|a, b| a.fitness.partial_cmp(&b.fitness).unwrap_or(std::cmp::Ordering::Equal))
    }

    pub fn report(&self) -> EvolutionReport {
        let all: Vec<f64> = self
            .islands
            .iter()
            .flat_map(|island| island.individuals.iter().map(|i| i.fitness))
            .collect();
        let population = all.len();
        let best_fitness = all.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mean_fitness = if population == 0 {
            0.0
        } else {
            all.iter().sum::<f64>() / population as f64
        };
        let (verified_count, rejected_count) = self
            .last_quality_counts
            .unwrap_or((population, 0));
        EvolutionReport {
            generation: self.generation,
            best_fitness,
            mean_fitness,
            novelty_count: self.novelty.len(),
            population,
            verified_count,
            rejected_count,
        }
    }
}
