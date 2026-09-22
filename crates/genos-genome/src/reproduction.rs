use crate::dna::DnaStrand;
use crate::genome::Genome;
use rand::RngExt;
use uuid::Uuid;

pub struct MeioticCrossover;

impl MeioticCrossover {
    pub fn crossover<R: RngExt + ?Sized>(
        maternal: &DnaStrand,
        paternal: &DnaStrand,
        rng: &mut R,
    ) -> (DnaStrand, DnaStrand) {
        let len = maternal.len().min(paternal.len());
        if len == 0 {
            return (maternal.clone(), paternal.clone());
        }
        let point = rng.random_range(1..len);
        let mut first_seq = maternal.as_slice()[..point].to_vec();
        first_seq.extend_from_slice(&paternal.as_slice()[point..]);
        let mut second_seq = paternal.as_slice()[..point].to_vec();
        second_seq.extend_from_slice(&maternal.as_slice()[point..]);
        (DnaStrand::new(first_seq), DnaStrand::new(second_seq))
    }

    pub fn fertilize<R: RngExt + ?Sized>(
        parent_a: &Genome,
        parent_b: &Genome,
        rng: &mut R,
    ) -> Genome {
        let mut child = parent_a.derive_reproductive_child();
        child.set_identity(Uuid::new_v4());
        child.parent_ids = vec![parent_a.genome_id(), parent_b.genome_id()];
        child.generation = parent_a.generation.max(parent_b.generation).saturating_add(1);

        let (a_mat, _a_pat) = Self::crossover(
            &parent_a.chromosome_maternal,
            &parent_a.chromosome_paternal,
            rng,
        );
        let (b_mat, _b_pat) = Self::crossover(
            &parent_b.chromosome_maternal,
            &parent_b.chromosome_paternal,
            rng,
        );
        child.chromosome_maternal = a_mat;
        child.chromosome_paternal = b_mat;
        child.extra_chromosomes = build_extra_chromosomes(parent_a, parent_b, rng);

        child
    }
}

fn build_extra_chromosomes<R: RngExt + ?Sized>(
    parent_a: &Genome,
    parent_b: &Genome,
    rng: &mut R,
) -> Vec<DnaStrand> {
    let mut combined = parent_a.extra_chromosomes.clone();
    for chrom in &parent_b.extra_chromosomes {
        if rng.random_bool(0.5) {
            combined.push(chrom.clone());
        }
    }
    combined
}

pub struct GenealogyTree;

impl GenealogyTree {
    pub fn build_lineage(
        _root: &Genome,
        descendants: &[Genome],
    ) -> Vec<(Uuid, Vec<Uuid>)> {
        let mut children_map: std::collections::HashMap<Uuid, Vec<Uuid>> =
            std::collections::HashMap::new();
        for desc in descendants {
            for parent_id in &desc.parent_ids {
                children_map
                    .entry(*parent_id)
                    .or_default()
                    .push(desc.genome_id());
            }
        }
        for children in children_map.values_mut() {
            children.sort();
            children.dedup();
        }
        let mut lineage: Vec<(Uuid, Vec<Uuid>)> = children_map.into_iter().collect();
        lineage.sort_by_key(|(parent, _)| *parent);
        lineage
    }

    pub fn divergence(a: &Genome, b: &Genome) -> f64 {
        let total = count_comparable_positions(a, b);
        if total == 0 {
            return 0.0;
        }
        let mismatches = count_mismatches(a, b);
        mismatches as f64 / total as f64
    }

    pub fn detect_forks(lineage: &[(Uuid, Vec<Uuid>)]) -> Vec<Uuid> {
        lineage
            .iter()
            .filter(|(_, children)| children.len() > 1)
            .map(|(parent, _)| *parent)
            .collect()
    }
}

fn count_comparable_positions(a: &Genome, b: &Genome) -> usize {
    let mat_len = a.chromosome_maternal.len().min(b.chromosome_maternal.len());
    let pat_len = a.chromosome_paternal.len().min(b.chromosome_paternal.len());
    mat_len + pat_len
}

fn count_mismatches(a: &Genome, b: &Genome) -> usize {
    let mat_mismatches = a
        .chromosome_maternal
        .as_slice()
        .iter()
        .zip(b.chromosome_maternal.as_slice().iter())
        .filter(|(x, y)| x != y)
        .count();
    let pat_mismatches = a
        .chromosome_paternal
        .as_slice()
        .iter()
        .zip(b.chromosome_paternal.as_slice().iter())
        .filter(|(x, y)| x != y)
        .count();
    let a_extra = a
        .extra_chromosomes
        .iter()
        .any(|c| !b.extra_chromosomes.contains(c));
    let b_extra = b
        .extra_chromosomes
        .iter()
        .any(|c| !a.extra_chromosomes.contains(c));
    let extra_penalty = if a_extra || b_extra { 1 } else { 0 };
    mat_mismatches + pat_mismatches + extra_penalty
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dna::DnaNucleotide;
    use crate::genome::Genome;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn crossover_produces_two_strands_of_correct_length() {
        let maternal = DnaStrand::new(vec![DnaNucleotide::A; 20]);
        let paternal = DnaStrand::new(vec![DnaNucleotide::T; 20]);
        let mut rng = StdRng::seed_from_u64(42);

        let (first, second) = MeioticCrossover::crossover(&maternal, &paternal, &mut rng);

        assert_eq!(first.len(), 20);
        assert_eq!(second.len(), 20);
    }

    #[test]
    fn fertilized_child_has_both_parents_in_parent_ids() {
        let parent_a = Genome::new("PARENT_A");
        let parent_b = Genome::new("PARENT_B");
        let mut rng = StdRng::seed_from_u64(99);

        let child = MeioticCrossover::fertilize(&parent_a, &parent_b, &mut rng);

        assert_eq!(
            child.parent_ids,
            vec![parent_a.genome_id(), parent_b.genome_id()]
        );
        assert_eq!(child.generation, 1);
    }

    #[test]
    fn lineage_tree_detects_forks() {
        let parent = Genome::new("ANCESTOR");
        let child_a = parent.derive_child();
        let child_b = parent.derive_child();

        let descendants = vec![child_a.clone(), child_b.clone()];
        let lineage = GenealogyTree::build_lineage(&parent, &descendants);

        let forks = GenealogyTree::detect_forks(&lineage);
        assert!(forks.contains(&parent.genome_id()));
    }

    #[test]
    fn divergence_is_zero_for_identical_genomes() {
        let genome = Genome::new("IDENTICAL");
        let div = GenealogyTree::divergence(&genome, &genome);
        assert_eq!(div, 0.0);
    }

    #[test]
    fn divergence_is_positive_for_different_genomes() {
        let g1 = Genome::new("DIVERGE_A");
        let g2 = Genome::new("DIVERGE_B");
        let div = GenealogyTree::divergence(&g1, &g2);
        assert!(div > 0.0);
    }

    #[test]
    fn fertilized_child_has_valid_genome_id() {
        let parent_a = Genome::new("VALID_A");
        let parent_b = Genome::new("VALID_B");
        let mut rng = StdRng::seed_from_u64(7);

        let child = MeioticCrossover::fertilize(&parent_a, &parent_b, &mut rng);

        assert_ne!(child.genome_id(), Uuid::nil());
        assert_ne!(child.genome_id(), parent_a.genome_id());
        assert_ne!(child.genome_id(), parent_b.genome_id());
    }
}
