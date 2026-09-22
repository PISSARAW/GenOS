use crate::genome::Genome;
use crate::reproduction::MeioticCrossover;
use rand::RngExt;

#[derive(Clone, Debug, PartialEq)]
pub struct ForkResult {
    pub child: Genome,
    pub divergence_applied: f64,
    pub parent_contributions: (f64, f64),
}

pub struct ForkOperator;

impl ForkOperator {
    pub fn fork<R: RngExt + ?Sized>(
        parent: &Genome,
        divergence_rate: f64,
        rng: &mut R,
    ) -> ForkResult {
        let mut child = parent.derive_child();
        let clamped = divergence_rate.clamp(0.0, 1.0);
        child.chromosome_maternal.mutate_stochastic(clamped, rng);
        child.chromosome_paternal.mutate_stochastic(clamped, rng);
        if clamped > 0.0 {
            Self::apply_gene_divergence(&mut child, clamped, rng);
        }
        ForkResult {
            child,
            divergence_applied: clamped,
            parent_contributions: (1.0, 0.0),
        }
    }

    pub fn fork_with_partner<R: RngExt + ?Sized>(
        parent_a: &Genome,
        parent_b: &Genome,
        divergence_rate: f64,
        rng: &mut R,
    ) -> ForkResult {
        let mut child = MeioticCrossover::fertilize(parent_a, parent_b, rng);
        let clamped = divergence_rate.clamp(0.0, 1.0);
        if clamped > 0.0 {
            child.chromosome_maternal.mutate_stochastic(clamped, rng);
            child.chromosome_paternal.mutate_stochastic(clamped, rng);
            Self::apply_gene_divergence(&mut child, clamped, rng);
        }
        ForkResult {
            child,
            divergence_applied: clamped,
            parent_contributions: (0.5, 0.5),
        }
    }

    fn apply_gene_divergence<R: RngExt + ?Sized>(genome: &mut Genome, rate: f64, rng: &mut R) {
        let loci: Vec<String> = genome.genes.keys().cloned().collect();
        for locus in loci {
            if !rng.random_bool(rate) {
                continue;
            }
            if rng.random_bool(0.5) {
                genome.genes.remove(&locus);
            } else if let Some(gene) = genome.genes.get(&locus) {
                let original = gene.dna.as_str();
                let mut new_dna = String::with_capacity(original.len() * 2);
                new_dna.push_str(&original);
                new_dna.push_str(&original);
                genome.genes.get_mut(&locus).unwrap().dna =
                    crate::dna::DnaStrand::synthesize(&new_dna);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn fork_produces_new_genome_id() {
        let parent = Genome::new("FORK_ID");
        let mut rng = StdRng::seed_from_u64(42);
        let result = ForkOperator::fork(&parent, 0.0, &mut rng);
        assert_ne!(result.child.genome_id(), parent.genome_id());
    }

    #[test]
    fn fork_zero_divergence_identical_chromosomes() {
        let parent = Genome::new("FORK_ZERO");
        let mut rng = StdRng::seed_from_u64(42);
        let result = ForkOperator::fork(&parent, 0.0, &mut rng);
        assert_eq!(
            result.child.chromosome_maternal.as_slice(),
            parent.chromosome_maternal.as_slice()
        );
        assert_eq!(
            result.child.chromosome_paternal.as_slice(),
            parent.chromosome_paternal.as_slice()
        );
    }

    #[test]
    fn fork_positive_divergence_differs_chromosomes() {
        let parent = Genome::new("FORK_POS");
        let mut rng = StdRng::seed_from_u64(42);
        let result = ForkOperator::fork(&parent, 1.0, &mut rng);
        assert_ne!(
            result.child.chromosome_maternal.as_slice(),
            parent.chromosome_maternal.as_slice()
        );
    }

    #[test]
    fn fork_with_partner_has_both_parents() {
        let parent_a = Genome::new("FORK_A");
        let parent_b = Genome::new("FORK_B");
        let mut rng = StdRng::seed_from_u64(7);
        let result = ForkOperator::fork_with_partner(&parent_a, &parent_b, 0.0, &mut rng);
        assert_eq!(
            result.child.parent_ids,
            vec![parent_a.genome_id(), parent_b.genome_id()]
        );
    }

    #[test]
    fn fork_parent_ids_contains_single_parent() {
        let parent = Genome::new("FORK_SINGLE");
        let mut rng = StdRng::seed_from_u64(42);
        let result = ForkOperator::fork(&parent, 0.0, &mut rng);
        assert_eq!(result.child.parent_ids, vec![parent.genome_id()]);
    }
}
