use genos_genome::Genome;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::seed::{default_seed, rng_from_seed};

pub struct MeioticCrossover;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Parentage {
    pub parent_a: Uuid,
    pub parent_b: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CrossoverResult {
    pub child: Genome,
    pub parentage: Parentage,
}

impl MeioticCrossover {
    pub fn single_point_crossover(parent_a: &Genome, parent_b: &Genome, crossover_point: usize) -> (Genome, Genome) {
        let mut child_a = parent_a.derive_child();
        let mut child_b = parent_b.derive_child();

        let (a_gamete_1, a_gamete_2) = Self::gametes(parent_a, crossover_point);
        let (b_gamete_1, b_gamete_2) = Self::gametes(parent_b, crossover_point);
        child_a.chromosome_maternal.replace_sequence(a_gamete_1);
        child_a.chromosome_paternal.replace_sequence(b_gamete_1);
        child_b.chromosome_maternal.replace_sequence(a_gamete_2);
        child_b.chromosome_paternal.replace_sequence(b_gamete_2);

        (child_a, child_b)
    }

    fn gametes(parent: &Genome, crossover_point: usize) -> (Vec<genos_genome::DnaNucleotide>, Vec<genos_genome::DnaNucleotide>) {
        let point = crossover_point.min(parent.chromosome_maternal.len()).min(parent.chromosome_paternal.len());
        let mut first = parent.chromosome_maternal.as_slice()[..point].to_vec();
        first.extend_from_slice(&parent.chromosome_paternal.as_slice()[point..]);
        let mut second = parent.chromosome_paternal.as_slice()[..point].to_vec();
        second.extend_from_slice(&parent.chromosome_maternal.as_slice()[point..]);
        (first, second)
    }

    pub fn uniform_crossover(parent_a: &Genome, parent_b: &Genome, swap_prob: f64) -> Genome {
        Self::uniform_crossover_with_seed(parent_a, parent_b, swap_prob, &default_seed(
            &parent_a.genome_id().to_string(),
            &parent_b.genome_id().to_string(),
        ))
    }

    pub fn uniform_crossover_with_seed(parent_a: &Genome, parent_b: &Genome, swap_prob: f64, seed: &str) -> Genome {
        let mut child = parent_a.derive_child();
        let swap_prob = swap_prob.clamp(0.0, 1.0);
        let mut rng = rng_from_seed(seed);
        let mut maternal = child.chromosome_maternal.as_slice().to_vec();
        let mut paternal = child.chromosome_paternal.as_slice().to_vec();
        for (a, b) in maternal.iter_mut().zip(parent_b.chromosome_maternal.as_slice().iter()) {
            if rng.random_bool(swap_prob) {
                *a = b.clone();
            }
        }
        for (a, b) in paternal.iter_mut().zip(parent_b.chromosome_paternal.as_slice().iter()) {
            if rng.random_bool(swap_prob) {
                *a = b.clone();
            }
        }
        child.chromosome_maternal.replace_sequence(maternal);
        child.chromosome_paternal.replace_sequence(paternal);
        for (locus, gene_b) in &parent_b.genes {
            if rng.random_bool(swap_prob) {
                child.genes.insert(locus.clone(), gene_b.clone());
            }
        }
        for plasmid in &parent_b.plasmids {
            if rng.random_bool(swap_prob) && !child.plasmids.contains(plasmid) {
                child.plasmids.push(plasmid.clone());
            }
        }
        for enhancer in &parent_b.regulatory_enhancers {
            if rng.random_bool(swap_prob) && !child.regulatory_enhancers.contains(enhancer) {
                child.regulatory_enhancers.push(enhancer.clone());
            }
        }
        child
    }

    pub fn uniform_crossover_with_parentage(parent_a: &Genome, parent_b: &Genome, swap_prob: f64) -> CrossoverResult {
        CrossoverResult {
            child: Self::uniform_crossover(parent_a, parent_b, swap_prob),
            parentage: Parentage { parent_a: parent_a.genome_id(), parent_b: parent_b.genome_id() },
        }
    }
}
