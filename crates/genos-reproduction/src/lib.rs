pub use genos_genome as genome;
pub use genos_cell as cell;

pub mod crossover;
pub mod division;
pub mod phylogeny;
mod seed;

pub use crossover::MeioticCrossover;
pub use division::{
    BuddingResult, CellDivision, DivisionMode, MitosisAttestation, MitosisResult,
    SchizogonyResult, MAX_MEROZOITES, MIN_MEROZOITES,
};
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
    fn test_mitosis_attestation_and_spindle_checkpoint() {
        let mut g = Genome::new("STEM_CELL_TOTIPOTENT");
        let res = CellDivision::mitosis_attested(&g).unwrap();
        assert_eq!(res.parent.genome_id(), g.genome_id());
        assert_ne!(res.clone.genome_id(), g.genome_id());
        assert_eq!(res.attestation.parent_id, g.genome_id());
        assert_eq!(res.attestation.clone_id, res.clone.genome_id());
        assert_eq!(res.attestation.lineage_id, g.lineage_id());
        assert!(res.attestation.spindle_aligned);
        assert!(res.attestation.amitosis_rejected);
        assert!(!res.attestation.spindle_alignment_hash.is_empty());
        assert!(!res.attestation.attestation_hash.is_empty());

        // Test Spindle Assembly Checkpoint failure upon chromosomal length mismatch
        let mut broken_sequence = g.chromosome_paternal.as_slice().to_vec();
        broken_sequence.push(genos_genome::DnaNucleotide::A);
        g.chromosome_paternal.replace_sequence(broken_sequence);
        let err = CellDivision::mitosis_attested(&g);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Mitotic spindle assembly checkpoint failed"));
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
    fn test_schizogony_bounded_and_seeded() {
        let genome = Genome::new("SCHIZONT_TEST");
        assert!(CellDivision::schizogony(&genome, 1).is_err());
        assert!(CellDivision::schizogony(&genome, 0).is_err());
        assert!(CellDivision::schizogony(&genome, MAX_MEROZOITES + 1).is_err());

        let res = CellDivision::schizogony_with_seed(&genome, 4, 0.1, "deterministic-seed-123").unwrap();
        assert_eq!(res.mother_genome_id, genome.genome_id());
        assert!(res.mother_lysed);
        assert_eq!(res.merozoites.len(), 4);
        assert_eq!(res.mutation_rate_applied, 0.1);

        for merozoite in res.merozoites.iter() {
            assert_ne!(merozoite.genome_id(), genome.genome_id());
            assert_eq!(merozoite.lineage_id(), genome.lineage_id());
            assert!(merozoite.genes.contains_key("merozoite_index"));
        }
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

    #[test]
    fn test_binary_fission_stochastic_mutation_and_gene_sync() {
        let mut genome = Genome::new("PROKARYOTE_ANCESTOR_SEQUENCE_LONG_ENOUGH");
        let gene = genos_genome::Gene::new("strategy", "ACTGACTGACTG");
        genome.insert_gene(gene.clone());
        let plasmid = genos_genome::Plasmid::new("plasmid_antibiotic_resistance");
        let orig_plasmid_id = plasmid.id;
        genome.plasmids.push(plasmid);

        // 1. With mutation_rate = 0.0, no mutations occur
        let (parent_zero, child_zero) = CellDivision::binary_fission(&genome, 0.0).unwrap();
        assert_eq!(parent_zero.genome_id(), genome.genome_id());
        assert_ne!(child_zero.genome_id(), genome.genome_id());
        assert_eq!(child_zero.chromosome_maternal.as_slice(), genome.chromosome_maternal.as_slice());
        assert_eq!(child_zero.genes.get("strategy").unwrap().dna.as_slice(), genome.genes.get("strategy").unwrap().dna.as_slice());
        // Plasmids replicated with new ID
        assert_eq!(child_zero.plasmids.len(), 1);
        assert_ne!(child_zero.plasmids[0].id, orig_plasmid_id);
        // Eukaryotic metadata cleared
        assert!(child_zero.endogenous_retroviruses.is_empty());
        assert!(child_zero.extra_chromosomes.is_empty());

        // 2. With high mutation_rate = 0.8, stochastic mutations occur on chromosomes AND genes
        let (_, child_mut) = CellDivision::binary_fission(&genome, 0.8).unwrap();
        assert_ne!(child_mut.chromosome_maternal.as_slice(), genome.chromosome_maternal.as_slice());
        assert_ne!(child_mut.genes.get("strategy").unwrap().dna.as_slice(), genome.genes.get("strategy").unwrap().dna.as_slice());
        // Gene is euchromatin unlocked
        let mutated_gene = child_mut.genes.get("strategy").unwrap();
        assert_eq!(mutated_gene.chromatin_state, genos_genome::ChromatinState::Euchromatin);
        assert!(!mutated_gene.developmentally_locked);
    }
}
