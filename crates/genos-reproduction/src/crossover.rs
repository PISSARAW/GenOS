use genos_genome::Genome;
use rand::RngExt;
use uuid::Uuid;

pub struct MeioticCrossover;

impl MeioticCrossover {
    pub fn single_point_crossover(parent_a: &Genome, parent_b: &Genome, crossover_point: usize) -> (Genome, Genome) {
        let mut child_a = parent_a.clone();
        let mut child_b = parent_b.clone();

        let (a_gamete_1, a_gamete_2) = Self::gametes(parent_a, crossover_point);
        let (b_gamete_1, b_gamete_2) = Self::gametes(parent_b, crossover_point);
        child_a.chromosome_maternal.sequence = a_gamete_1;
        child_a.chromosome_paternal.sequence = b_gamete_1;
        child_b.chromosome_maternal.sequence = a_gamete_2;
        child_b.chromosome_paternal.sequence = b_gamete_2;
        child_a.genome_id = Uuid::new_v4();
        child_b.genome_id = Uuid::new_v4();

        (child_a, child_b)
    }

    fn gametes(parent: &Genome, crossover_point: usize) -> (Vec<genos_genome::DnaNucleotide>, Vec<genos_genome::DnaNucleotide>) {
        let point = crossover_point.min(parent.chromosome_maternal.sequence.len())
            .min(parent.chromosome_paternal.sequence.len());
        let mut first = parent.chromosome_maternal.sequence[..point].to_vec();
        first.extend_from_slice(&parent.chromosome_paternal.sequence[point..]);
        let mut second = parent.chromosome_paternal.sequence[..point].to_vec();
        second.extend_from_slice(&parent.chromosome_maternal.sequence[point..]);
        (first, second)
    }

    pub fn uniform_crossover(parent_a: &Genome, parent_b: &Genome, swap_prob: f64) -> Genome {
        let mut child = parent_a.clone();
        child.genome_id = Uuid::new_v4();
        let swap_prob = swap_prob.clamp(0.0, 1.0);
        let mut rng = rand::rng();
        for (a, b) in child
            .chromosome_maternal
            .sequence
            .iter_mut()
            .zip(parent_b.chromosome_maternal.sequence.iter())
        {
            if rng.random_bool(swap_prob) {
                *a = b.clone();
            }
        }
        for (a, b) in child
            .chromosome_paternal
            .sequence
            .iter_mut()
            .zip(parent_b.chromosome_paternal.sequence.iter())
        {
            if rng.random_bool(swap_prob) {
                *a = b.clone();
            }
        }
        for (locus, gene_b) in &parent_b.genes {
            if rng.random_bool(swap_prob) {
                child.genes.insert(locus.clone(), gene_b.clone());
            }
        }
        child
    }
}
