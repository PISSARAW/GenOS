use crate::genome::Genome;
use serde::{Deserialize, Serialize};

/// Niche comportemental pour la maintenance de diversité QD.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Niche {
    pub id: String,
    pub center: Vec<f64>,
    pub radius: f64,
    pub occupant: Option<String>,
    pub best_fitness: f64,
}

/// Archive de diversité par Quality-Diversity.
pub struct QDArchive {
    pub niches: Vec<Niche>,
    pub descriptor_fn: fn(&Genome) -> Vec<f64>,
}

impl QDArchive {
    pub fn new(niches: Vec<Niche>) -> Self {
        Self {
            niches,
            descriptor_fn: default_descriptor,
        }
    }

    /// Calcule le descripteur comportemental d'un génome.
    pub fn describe(&self, genome: &Genome) -> Vec<f64> {
        (self.descriptor_fn)(genome)
    }

    /// Trouve la niche la plus proche d'un descripteur.
    pub fn find_niche(&self, descriptor: &[f64]) -> Option<usize> {
        self.niches
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                let da = euclidean_distance(&a.center, descriptor);
                let db = euclidean_distance(&b.center, descriptor);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(i, _)| i)
    }

    /// Insère un génome dans l'archive si il améliore sa niche.
    pub fn insert(&mut self, genome: &Genome, genome_id: &str, fitness: f64) -> bool {
        let descriptor = self.describe(genome);
        let niche_idx = match self.find_niche(&descriptor) {
            Some(idx) => idx,
            None => return false,
        };
        let niche = &mut self.niches[niche_idx];
        let distance = euclidean_distance(&niche.center, &descriptor);
        if distance <= niche.radius && fitness > niche.best_fitness {
            niche.occupant = Some(genome_id.to_string());
            niche.best_fitness = fitness;
            return true;
        }
        false
    }

    /// Compte les niches occupées.
    pub fn coverage(&self) -> (usize, usize) {
        let occupied = self.niches.iter().filter(|n| n.occupant.is_some()).count();
        (occupied, self.niches.len())
    }
}

fn default_descriptor(genome: &Genome) -> Vec<f64> {
    let gene_count = genome.genes.len() as f64;
    let total_volume: f64 = genome.genes.values().map(|g| g.expression_volume).sum();
    let extra = genome.extra_chromosomes.len() as f64;
    vec![gene_count, total_volume, extra]
}

fn euclidean_distance(a: &[f64], b: &[f64]) -> f64 {
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x - y).powi(2))
        .sum::<f64>()
        .sqrt()
}

/// Environnement changeant : les tâches évoluent au fil des générations.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EnvironmentState {
    pub generation: u32,
    pub task_weights: Vec<f64>,
    pub task_ids: Vec<String>,
}

impl EnvironmentState {
    pub fn new(task_ids: Vec<String>) -> Self {
        let n = task_ids.len().max(1) as f64;
        Self {
            generation: 0,
            task_weights: vec![1.0 / n; task_ids.len()],
            task_ids,
        }
    }

    /// Fait évoluer l'environnement : rotation des poids.
    pub fn shift(&mut self) {
        self.generation += 1;
        let n = self.task_weights.len();
        if n < 2 {
            return;
        }
        let rotation = (self.generation as usize) % n;
        self.task_weights.rotate_right(rotation);
        let sum: f64 = self.task_weights.iter().sum();
        if sum > 0.0 {
            for w in &mut self.task_weights {
                *w /= sum;
            }
        }
    }

    /// Calcule le fitness pondéré d'un génome sur toutes les tâches.
    pub fn weighted_fitness(
        &self,
        _genome: &Genome,
        records: &std::collections::HashMap<String, f64>,
    ) -> f64 {
        self.task_ids
            .iter()
            .enumerate()
            .map(|(i, task)| {
                let w = self.task_weights.get(i).copied().unwrap_or(0.0);
                let score = records.get(task).copied().unwrap_or(0.0);
                w * score
            })
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_genome() -> Genome {
        let mut g = Genome::new("TEST_NICHE");
        let gene = crate::gene::Gene::new("TEST_GENE", "ATGCATGC");
        g.insert_gene(gene);
        g
    }

    #[test]
    fn qd_archive_inserts_into_correct_niche() {
        let mut archive = QDArchive::new(vec![
            Niche {
                id: "n1".into(),
                center: vec![1.0, 1.0, 0.0],
                radius: 2.0,
                occupant: None,
                best_fitness: 0.0,
            },
            Niche {
                id: "n2".into(),
                center: vec![10.0, 10.0, 5.0],
                radius: 2.0,
                occupant: None,
                best_fitness: 0.0,
            },
        ]);
        let genome = test_genome();
        let inserted = archive.insert(&genome, "g1", 50.0);
        assert!(inserted);
        let (occupied, total) = archive.coverage();
        assert_eq!(occupied, 1);
        assert_eq!(total, 2);
    }

    #[test]
    fn qd_archive_rejects_worse_fitness() {
        let mut archive = QDArchive::new(vec![Niche {
            id: "n1".into(),
            center: vec![1.0, 1.0, 0.0],
            radius: 2.0,
            occupant: Some("g0".into()),
            best_fitness: 90.0,
        }]);
        let genome = test_genome();
        let inserted = archive.insert(&genome, "g1", 50.0);
        assert!(!inserted);
    }

    #[test]
    fn environment_shift_rotates_weights() {
        let mut env = EnvironmentState::new(vec!["t1".into(), "t2".into(), "t3".into()]);
        let initial = env.task_weights.clone();
        env.shift();
        assert_ne!(env.task_weights, initial);
        assert_eq!(env.generation, 1);
    }

    #[test]
    fn environment_weighted_fitness_computes_correctly() {
        let env = EnvironmentState::new(vec!["t1".into(), "t2".into()]);
        let mut records = std::collections::HashMap::new();
        records.insert("t1".into(), 80.0);
        records.insert("t2".into(), 40.0);
        let genome = test_genome();
        let wf = env.weighted_fitness(&genome, &records);
        assert!(wf > 0.0);
    }
}
