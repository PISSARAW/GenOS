use genos_genome::Genome;

pub struct MeioticCrossover;

impl MeioticCrossover {
    pub fn single_point_crossover(parent_a: &Genome, parent_b: &Genome, crossover_point: usize) -> (Genome, Genome) {
        let mut child_a = parent_a.clone();
        let mut child_b = parent_b.clone();

        let mut a_mat = parent_a.chromosome_maternal.sequence.clone();
        let mut b_mat = parent_b.chromosome_maternal.sequence.clone();

        if crossover_point < a_mat.len() && crossover_point < b_mat.len() {
            let a_tail = a_mat.split_off(crossover_point);
            let b_tail = b_mat.split_off(crossover_point);
            a_mat.extend(b_tail);
            b_mat.extend(a_tail);

            child_a.chromosome_maternal.sequence = a_mat;
            child_b.chromosome_maternal.sequence = b_mat;
        }

        (child_a, child_b)
    }

    pub fn uniform_crossover(parent_a: &Genome, parent_b: &Genome, swap_prob: f64) -> Genome {
        let mut child = parent_a.clone();
        for (i, gene_b) in parent_b.genes.iter().enumerate() {
            let roll = ((i * 37) % 100) as f64 / 100.0;
            if roll < swap_prob {
                child.genes.insert(gene_b.0.clone(), gene_b.1.clone());
            }
        }
        child
    }
}
