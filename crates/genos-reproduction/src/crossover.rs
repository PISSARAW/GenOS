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
        let mut child_a = parent_a.derive_reproductive_child();
        let mut child_b = parent_b.derive_reproductive_child();

        let (a_gamete_1, a_gamete_2) = Self::gametes(parent_a, crossover_point);
        let (b_gamete_1, b_gamete_2) = Self::gametes(parent_b, crossover_point);
        child_a.chromosome_maternal.replace_sequence(a_gamete_1);
        child_a.chromosome_paternal.replace_sequence(b_gamete_1);
        child_b.chromosome_maternal.replace_sequence(a_gamete_2);
        child_b.chromosome_paternal.replace_sequence(b_gamete_2);

        // Recombinaison réciproque des gènes selon le point de coupure
        let mut all_loci: Vec<String> = parent_a.genes.keys().chain(parent_b.genes.keys()).cloned().collect();
        all_loci.sort();
        all_loci.dedup();
        let gene_split = all_loci.len() / 2;

        let mut genes_a = std::collections::BTreeMap::new();
        let mut genes_b = std::collections::BTreeMap::new();

        for (idx, locus) in all_loci.iter().enumerate() {
            let from_a = parent_a.genes.get(locus);
            let from_b = parent_b.genes.get(locus);

            if idx < gene_split {
                if let Some(g) = from_a.or(from_b) {
                    genes_a.insert(locus.clone(), g.clone());
                }
                if let Some(g) = from_b.or(from_a) {
                    genes_b.insert(locus.clone(), g.clone());
                }
            } else {
                if let Some(g) = from_b.or(from_a) {
                    genes_a.insert(locus.clone(), g.clone());
                }
                if let Some(g) = from_a.or(from_b) {
                    genes_b.insert(locus.clone(), g.clone());
                }
            }
        }
        child_a.genes = genes_a;
        child_b.genes = genes_b;

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
        let mut child = parent_a.derive_reproductive_child();
        let swap_prob = swap_prob.clamp(0.0, 1.0);
        let mut rng = rng_from_seed(seed);

        // Méiose et amphimixie biologique :
        // 1. Gamète haploïde issu du parent A (recombinaison homologue de ses chromosomes maternel & paternel)
        let gamete_a = Self::recombine_gamete_uniform(parent_a, swap_prob, &mut rng);
        // 2. Gamète haploïde issu du parent B (recombinaison homologue de ses chromosomes maternel & paternel)
        let gamete_b = Self::recombine_gamete_uniform(parent_b, swap_prob, &mut rng);

        // Fécondation : constitution du zygote diploïde (gamète A -> maternel, gamète B -> paternel)
        child.chromosome_maternal.replace_sequence(gamete_a);
        child.chromosome_paternal.replace_sequence(gamete_b);

        // Recombinaison mendélienne équilibrée des gènes
        let mut all_loci: std::collections::BTreeSet<String> = parent_a.genes.keys().cloned().collect();
        all_loci.extend(parent_b.genes.keys().cloned());
        let mut recombined_genes = std::collections::BTreeMap::new();

        for locus in all_loci {
            match (parent_a.genes.get(&locus), parent_b.genes.get(&locus)) {
                (Some(ga), Some(gb)) => {
                    let chosen = if rng.random_bool(swap_prob) { gb } else { ga };
                    recombined_genes.insert(locus, chosen.clone());
                }
                (Some(ga), None) => {
                    if rng.random_bool(1.0 - swap_prob * 0.5) {
                        recombined_genes.insert(locus, ga.clone());
                    }
                }
                (None, Some(gb)) => {
                    if rng.random_bool(swap_prob) {
                        recombined_genes.insert(locus, gb.clone());
                    }
                }
                (None, None) => {}
            }
        }
        child.genes = recombined_genes;

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

    fn recombine_gamete_uniform<R: rand::Rng>(parent: &Genome, swap_prob: f64, rng: &mut R) -> Vec<genos_genome::DnaNucleotide> {
        let mat = parent.chromosome_maternal.as_slice();
        let pat = parent.chromosome_paternal.as_slice();
        let max_len = mat.len().max(pat.len());
        let mut gamete = Vec::with_capacity(max_len);

        for i in 0..max_len {
            let nuc = match (mat.get(i), pat.get(i)) {
                (Some(&m), Some(&p)) => {
                    if rng.random_bool(swap_prob) { p } else { m }
                }
                (Some(&m), None) => m,
                (None, Some(&p)) => p,
                (None, None) => unreachable!(),
            };
            gamete.push(nuc);
        }
        gamete
    }

    pub fn uniform_crossover_with_parentage(parent_a: &Genome, parent_b: &Genome, swap_prob: f64) -> CrossoverResult {
        CrossoverResult {
            child: Self::uniform_crossover(parent_a, parent_b, swap_prob),
            parentage: Parentage { parent_a: parent_a.genome_id(), parent_b: parent_b.genome_id() },
        }
    }
}
