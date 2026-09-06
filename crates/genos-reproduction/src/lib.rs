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
        assert_eq!(p.genome_id, g.genome_id);
        assert_ne!(c.genome_id, g.genome_id);
        assert_eq!(c.lineage_id, g.lineage_id);
    }

    #[test]
    fn test_meiotic_crossover() {
        let parent1 = Genome::new("PARENT_AAA");
        let parent2 = Genome::new("PARENT_BBB");
        let child = MeioticCrossover::uniform_crossover(&parent1, &parent2, 0.5);
        assert_ne!(child.genome_id, parent1.genome_id);
        assert_eq!(child.lineage_id, parent1.lineage_id);
    }
}
