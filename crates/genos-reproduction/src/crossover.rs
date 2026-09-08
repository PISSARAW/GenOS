use genos_genome::{ChromatinState, Gene, Genome};
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
    fn reprogram_inherited_gene(mut gene: Gene) -> Gene {
        // Epigenetic reprogramming: somatic facultative heterochromatin and somatic marks are reset to euchromatin,
        // while constitutive heterochromatin (centromeres, retrotransposons) is preserved.
        if gene.chromatin_state == ChromatinState::HeterochromatinFacultative {
            gene.chromatin_state = ChromatinState::Euchromatin;
            gene.is_methylated = false;
            gene.developmentally_locked = false;
            gene.bound_repressor = None;
            gene.expression_volume = 1.0;
        } else if gene.chromatin_state == ChromatinState::Euchromatin {
            gene.is_methylated = false;
            gene.developmentally_locked = false;
        }
        gene
    }

    pub fn single_point_crossover(parent_a: &Genome, parent_b: &Genome, crossover_point: usize) -> (Genome, Genome) {
        let mut child_a = parent_a.derive_reproductive_child();
        let mut child_b = parent_b.derive_reproductive_child();
        child_a.parent_ids = vec![parent_a.genome_id(), parent_b.genome_id()];
        child_b.parent_ids = vec![parent_a.genome_id(), parent_b.genome_id()];

        let (a_gamete_1, a_gamete_2) = Self::gametes(parent_a, crossover_point);
        let (b_gamete_1, b_gamete_2) = Self::gametes(parent_b, crossover_point);
        child_a.chromosome_maternal.replace_sequence(a_gamete_1);
        child_a.chromosome_paternal.replace_sequence(b_gamete_1);
        child_b.chromosome_maternal.replace_sequence(a_gamete_2);
        child_b.chromosome_paternal.replace_sequence(b_gamete_2);

        // Recombinaison réciproque des gènes selon le point de coupure avec reprogrammation épigénétique méiotique
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
                    genes_a.insert(locus.clone(), Self::reprogram_inherited_gene(g.clone()));
                }
                if let Some(g) = from_b.or(from_a) {
                    genes_b.insert(locus.clone(), Self::reprogram_inherited_gene(g.clone()));
                }
            } else {
                if let Some(g) = from_b.or(from_a) {
                    genes_a.insert(locus.clone(), Self::reprogram_inherited_gene(g.clone()));
                }
                if let Some(g) = from_a.or(from_b) {
                    genes_b.insert(locus.clone(), Self::reprogram_inherited_gene(g.clone()));
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
        child.parent_ids = vec![parent_a.genome_id(), parent_b.genome_id()];
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
                    recombined_genes.insert(locus, Self::reprogram_inherited_gene(chosen.clone()));
                }
                (Some(ga), None) => {
                    recombined_genes.insert(locus, Self::reprogram_inherited_gene(ga.clone()));
                }
                (None, Some(gb)) => {
                    recombined_genes.insert(locus, Self::reprogram_inherited_gene(gb.clone()));
                }
                (None, None) => {}
            }
        }
        child.genes = recombined_genes;

        for chromosome in &parent_b.extra_chromosomes {
            if !child.extra_chromosomes.iter().any(|existing| existing == chromosome) {
                child.extra_chromosomes.push(chromosome.clone());
            }
        }

        for plasmid in &parent_b.plasmids {
            if rng.random_bool(swap_prob) && !child.plasmids.iter().any(|existing| existing.instruction == plasmid.instruction) {
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

    pub fn crossover_with_speciation(
        parent_a: &Genome,
        parent_b: &Genome,
        swap_prob: f64,
        speciation_threshold: Option<f64>,
        seed: &str,
    ) -> Result<Genome, String> {
        let threshold = speciation_threshold.unwrap_or(crate::phylogeny::MAX_DIVERGENCE_INTROGRESSION);
        let divergence = crate::phylogeny::PhylogeneticTree::estimate_divergence_time(parent_a, parent_b);

        if divergence > threshold {
            return Err(format!(
                "Speciation barrier exceeded: phylogenetic divergence ({:.2} My) > threshold ({:.2} My)",
                divergence, threshold
            ));
        }

        Ok(Self::uniform_crossover_with_seed(parent_a, parent_b, swap_prob, seed))
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniform_crossover_preserves_unilateral_loci() {
        let mut parent_a = Genome::new("PARENT_A");
        parent_a.insert_gene(Gene::new("only_a", "A_GENE"));
        let mut parent_b = Genome::new("PARENT_B");
        parent_b.insert_gene(Gene::new("only_b", "B_GENE"));

        let child = MeioticCrossover::uniform_crossover_with_seed(&parent_a, &parent_b, 0.0, "unilateral-loci");

        assert!(child.genes.contains_key("only_a"));
        assert!(child.genes.contains_key("only_b"));
    }

    #[test]
    fn uniform_crossover_preserves_unique_extra_chromosomes() {
        let mut parent_a = Genome::new("PARENT_A");
        parent_a.extra_chromosomes.push(genos_genome::DnaStrand::synthesize("EXTRA_A"));
        let mut parent_b = Genome::new("PARENT_B");
        parent_b.extra_chromosomes.push(genos_genome::DnaStrand::synthesize("EXTRA_B"));

        let child = MeioticCrossover::uniform_crossover_with_seed(&parent_a, &parent_b, 0.5, "extra-chromosomes");

        assert_eq!(child.extra_chromosomes.len(), 2);
    }

    #[test]
    fn uniform_crossover_deduplicates_plasmids_by_instruction() {
        let mut parent_a = Genome::new("PARENT_A");
        parent_a.plasmids.push(genos_genome::Plasmid::new("shared-instruction"));
        let mut parent_b = Genome::new("PARENT_B");
        parent_b.plasmids.push(genos_genome::Plasmid::new("shared-instruction"));

        let child = MeioticCrossover::uniform_crossover_with_seed(&parent_a, &parent_b, 1.0, "plasmid-dedup");

        assert_eq!(child.plasmids.iter().filter(|plasmid| plasmid.instruction == "shared-instruction").count(), 1);
    }

    #[test]
    fn test_meiotic_crossover_epigenetic_reprogramming() {
        let mut parent_a = Genome::new("PARENT_A");
        let mut gene_a = Gene::new("defense_mechanism", "CRISPR_CAS9");
        gene_a.chromatin_state = ChromatinState::HeterochromatinFacultative;
        gene_a.is_methylated = true;
        gene_a.developmentally_locked = true;
        gene_a.bound_repressor = Some("HISTONE_H3K27ME3".into());
        gene_a.expression_volume = 0.05;
        parent_a.insert_gene(gene_a);

        let mut parent_b = Genome::new("PARENT_B");
        let mut gene_b = Gene::new("metabolic_pathway", "GLYCOLYSIS");
        gene_b.chromatin_state = ChromatinState::HeterochromatinConstitutive; // Constitutive remains locked
        gene_b.is_methylated = true;
        gene_b.developmentally_locked = true;
        parent_b.insert_gene(gene_b);

        // 1. Single point crossover
        let (child_1, child_2) = MeioticCrossover::single_point_crossover(&parent_a, &parent_b, 10);
        for child in [&child_1, &child_2] {
            if let Some(g) = child.genes.get("defense_mechanism") {
                assert_eq!(g.chromatin_state, ChromatinState::Euchromatin);
                assert!(!g.is_methylated);
                assert!(!g.developmentally_locked);
                assert!(g.bound_repressor.is_none());
                assert_eq!(g.expression_volume, 1.0);
            }
            if let Some(g) = child.genes.get("metabolic_pathway") {
                assert_eq!(g.chromatin_state, ChromatinState::HeterochromatinConstitutive);
                assert!(g.developmentally_locked);
            }
        }

        // 2. Uniform crossover
        let child_u = MeioticCrossover::uniform_crossover(&parent_a, &parent_b, 0.5);
        if let Some(g) = child_u.genes.get("defense_mechanism") {
            assert_eq!(g.chromatin_state, ChromatinState::Euchromatin);
            assert!(!g.is_methylated);
            assert!(!g.developmentally_locked);
        }
    }
}
