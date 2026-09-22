use crate::genome::Genome;
use crate::mutation_rates::MutationRates;
use crate::mutation_scales::{MutationResult, MutationScale};
use rand::Rng;
use rand::RngExt;
use serde::{Deserialize, Serialize};

/// Opérateur évolutif auto-modifiable : ses propres taux évoluent.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SelfModifyingMutator {
    pub mutation_rates: MutationRates,
    pub generation: u32,
    pub last_performance: f64,
}

impl SelfModifyingMutator {
    pub fn new(rates: MutationRates) -> Self {
        Self {
            mutation_rates: rates,
            generation: 0,
            last_performance: 0.0,
        }
    }

    /// Mutation multi-scale avec les taux auto-ajustés.
    pub fn mutate<R: Rng + ?Sized>(&mut self, genome: &mut Genome, rng: &mut R) -> Vec<MutationResult> {
        let mut results = Vec::new();
        for strand in [&mut genome.chromosome_maternal, &mut genome.chromosome_paternal] {
            results.extend(self.mutate_strand(strand, rng));
        }
        results.extend(self.mutate_genes(genome, rng));
        results
    }

    fn mutate_strand<R: Rng + ?Sized>(&self, strand: &mut crate::dna::DnaStrand, rng: &mut R) -> Vec<MutationResult> {
        let len = strand.len();
        if len == 0 {
            return Vec::new();
        }
        let mut results = Vec::new();
        for pos in 0..len {
            if rng.random_bool(self.mutation_rates.nucleotide) {
                let original = strand.as_slice()[pos].clone();
                let mutated = crate::dna::DnaNucleotide::nucleotide_random(rng);
                strand.mutate_point(pos, mutated.clone());
                results.push(MutationResult {
                    scale: MutationScale::Nucleotide,
                    effect: crate::mutation_scales::MutationEffect::Substitution,
                    affected_locus: None,
                    positions_changed: 1,
                    successful: true,
                    description: format!("Nucleotide {} -> {:?}", pos, mutated),
                });
            }
        }
        results
    }

    fn mutate_genes<R: Rng + ?Sized>(&self, genome: &mut Genome, rng: &mut R) -> Vec<MutationResult> {
        let mut results = Vec::new();
        let loci: Vec<String> = genome.genes.keys()
            .filter(|l| !l.starts_with("LOCUS_INSTINCT_"))
            .cloned()
            .collect();
        for locus in &loci {
            if !rng.random_bool(self.mutation_rates.gene) {
                continue;
            }
            if let Some(gene) = genome.genes.get_mut(locus) {
                let roll: u32 = rng.next_u32() % 3;
                match roll {
                    0 => {
                        gene.expression_volume = (gene.expression_volume + 0.1).min(2.0);
                        results.push(MutationResult {
                            scale: MutationScale::Gene,
                            effect: crate::mutation_scales::MutationEffect::Amplification { factor: 1 },
                            affected_locus: Some(locus.clone()),
                            positions_changed: 0,
                            successful: true,
                            description: format!("Upregulated {}", locus),
                        });
                    }
                    1 => {
                        gene.is_methylated = !gene.is_methylated;
                        results.push(MutationResult {
                            scale: MutationScale::Gene,
                            effect: crate::mutation_scales::MutationEffect::Substitution,
                            affected_locus: Some(locus.clone()),
                            positions_changed: 0,
                            successful: true,
                            description: format!("Methylation toggle {}", locus),
                        });
                    }
                    _ => {
                        if let Ok(new_locus) = genome.duplicate_gene(locus) {
                            results.push(MutationResult {
                                scale: MutationScale::Gene,
                                effect: crate::mutation_scales::MutationEffect::Duplication,
                                affected_locus: Some(new_locus.clone()),
                                positions_changed: 0,
                                successful: true,
                                description: format!("Gene duplication {} -> {}", locus, new_locus),
                            });
                        }
                    }
                }
            }
        }
        results
    }

    /// Auto-modifie les taux de mutation selon la performance.
    pub fn auto_adjust(&mut self, performance: f64) {
        self.generation += 1;
        let delta = performance - self.last_performance;
        if delta < 0.0 {
            // Performance baisse : augmenter l'exploration
            self.mutation_rates.nucleotide = (self.mutation_rates.nucleotide * 1.1).min(0.95);
            self.mutation_rates.gene = (self.mutation_rates.gene * 1.1).min(0.95);
        } else {
            // Performance monte : stabiliser l'exploitation
            self.mutation_rates.nucleotide = (self.mutation_rates.nucleotide * 0.95).max(0.001);
            self.mutation_rates.gene = (self.mutation_rates.gene * 0.95).max(0.001);
        }
        self.last_performance = performance;
    }
}

impl Default for SelfModifyingMutator {
    fn default() -> Self {
        Self::new(MutationRates::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;

    #[test]
    fn self_modifying_mutator_mutates() {
        let mut mutator = SelfModifyingMutator::new(MutationRates {
            nucleotide: 0.3,
            codon: 0.0,
            gene: 0.5,
            segment: 0.0,
            chromosome: 0.0,
            genome: 0.0,
        });
        let mut genome = Genome::new("SELF_MOD");
        let gene = crate::gene::Gene::new("MOD_GENE", "ATGCATGCATGC");
        genome.insert_gene(gene);
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        let results = mutator.mutate(&mut genome, &mut rng);
        assert!(!results.is_empty());
    }

    #[test]
    fn auto_adjust_increases_mutation_on_decline() {
        let mut mutator = SelfModifyingMutator::new(MutationRates {
            nucleotide: 0.1,
            codon: 0.0,
            gene: 0.1,
            segment: 0.0,
            chromosome: 0.0,
            genome: 0.0,
        });
        let initial_rate = mutator.mutation_rates.nucleotide;
        mutator.auto_adjust(-0.5);
        assert!(mutator.mutation_rates.nucleotide > initial_rate);
    }

    #[test]
    fn auto_adjust_decreases_mutation_on_improvement() {
        let mut mutator = SelfModifyingMutator::new(MutationRates {
            nucleotide: 0.5,
            codon: 0.0,
            gene: 0.5,
            segment: 0.0,
            chromosome: 0.0,
            genome: 0.0,
        });
        let initial_rate = mutator.mutation_rates.nucleotide;
        mutator.auto_adjust(0.5);
        assert!(mutator.mutation_rates.nucleotide < initial_rate);
    }
}
