pub use genos_genome as genome;
pub use genos_cell as cell;

pub mod crossover;
pub mod division;
pub mod phylogeny;

pub use crossover::MeioticCrossover;
pub use division::{CellDivision, DivisionMode};
pub use phylogeny::{
    Domain, EukaryoteClade, HybridizationResult, PhylogeneticNode, PhylogeneticTree,
};

#[cfg(test)]
mod tests {
    use super::*;
    use genos_genome::Genome;

    #[test]
    fn test_cell_division_mitosis() {
        let g = Genome::new("INITIAL_STEM_CELL");
        let (p, c) = CellDivision::mitosis(&g).unwrap();
            assert_eq!(p.genome_id(), g.genome_id());
            assert_ne!(c.genome_id(), g.genome_id());
            assert_eq!(c.lineage_id(), g.lineage_id());
    }

    #[test]
    fn test_meiotic_crossover() {
        let parent1 = Genome::new("PARENT_AAA");
        let parent2 = Genome::new("PARENT_BBB");
        let child = MeioticCrossover::uniform_crossover(&parent1, &parent2, 0.5);
            assert_ne!(child.genome_id(), parent1.genome_id());
            assert_eq!(child.lineage_id(), parent1.lineage_id());
    }

    #[test]
    fn test_all_division_modes_create_distinct_genomes() {
        let genome = Genome::new("DIVISION");
        let (_, fission_child) = CellDivision::binary_fission(&genome, 0.0).unwrap();
        let (_, budding_child) = CellDivision::budding(&genome, 0.4).unwrap();
        let schizonts = CellDivision::schizogony(&genome, 3).unwrap();
            assert_ne!(fission_child.genome_id(), genome.genome_id());
            assert_ne!(budding_child.genome_id(), genome.genome_id());
            assert_eq!(schizonts.len(), 3);
            assert_eq!(schizonts.iter().map(|child| child.genome_id()).collect::<std::collections::HashSet<_>>().len(), 3);
    }

    #[test]
    fn test_hybrid_has_new_genome_identity() {
        let parent_a = Genome::new("HYBRID_A");
        let parent_b = Genome::new("HYBRID_B");
        let result = PhylogeneticTree::attempt_hybridization(&parent_a, &parent_b, false);
        let child = match result {
            HybridizationResult::Introgression(genome) | HybridizationResult::SterileHybrid(genome) => genome,
            _ => panic!("test genomes should produce a hybrid"),
        };
            assert_ne!(child.genome_id(), parent_a.genome_id());
            assert_ne!(child.genome_id(), parent_b.genome_id());
            assert_eq!(child.lineage_id(), parent_a.lineage_id());
    }
}
