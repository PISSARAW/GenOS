use crate::mutation_scales::{MultiScaleMutator, MutationEffect, MutationRates, MutationResult, MutationScale};
use rand::rngs::StdRng;
use rand::SeedableRng;

fn test_genome() -> crate::genome::Genome {
    let mut g = crate::genome::Genome::new("ATGCATGC");
    let gene1 = crate::gene::Gene {
        locus: "GENE_A".to_string(),
        dna: crate::dna::DnaStrand::synthesize("ATGCATGCATGC"),
        is_methylated: false,
        expression_volume: 1.0,
        chromatin_state: crate::gene::ChromatinState::Euchromatin,
        developmentally_locked: false,
        required_activator: None,
        bound_repressor: None,
        default_exons: Vec::new(),
    };
    let gene2 = crate::gene::Gene {
        locus: "GENE_B".to_string(),
        dna: crate::dna::DnaStrand::synthesize("CGATCGATCGAT"),
        is_methylated: false,
        expression_volume: 1.0,
        chromatin_state: crate::gene::ChromatinState::Euchromatin,
        developmentally_locked: false,
        required_activator: None,
        bound_repressor: None,
        default_exons: Vec::new(),
    };
    g.genes.insert("GENE_A".to_string(), gene1);
    g.genes.insert("GENE_B".to_string(), gene2);
    g
}

#[test]
fn nucleotide_mutation_changes_strand() {
    let mut strand = crate::dna::DnaStrand::new(vec![
        crate::dna::DnaNucleotide::A,
        crate::dna::DnaNucleotide::T,
        crate::dna::DnaNucleotide::G,
        crate::dna::DnaNucleotide::C,
    ]);
    let original = strand.as_str();
    let mut rng = StdRng::seed_from_u64(42);
    let results = MultiScaleMutator::mutate_nucleotide(&mut strand, 0.5, &mut rng);
    assert!(!results.is_empty());
    assert_ne!(strand.as_str(), original);
}

#[test]
fn gene_mutation_effects() {
    let effects_found = {
        let mut g = test_genome();
        let mut rng = StdRng::seed_from_u64(1);
        MultiScaleMutator::mutate_gene(&mut g, 1.0, &mut rng)
    };
    assert!(
        !effects_found.is_empty(),
        "At least one mutation should occur at rate=1.0"
    );
    for r in &effects_found {
        assert!(r.positions_changed > 0);
        assert!(r.successful);
    }
}

#[test]
fn gene_deletion_removes_gene() {
    let mut g = test_genome();
    let before = g.genes.len();
    let mut rng = StdRng::seed_from_u64(42);
    let results = MultiScaleMutator::mutate_gene(&mut g, 1.0, &mut rng);
    let dels: Vec<_> = results
        .iter()
        .filter(|r| matches!(r.effect, MutationEffect::GeneDeletion))
        .collect();
    if !dels.is_empty() {
        assert!(g.genes.len() < before);
    }
}

#[test]
fn chromosomal_inversion() {
    let mut g = test_genome();
    let mut rng = StdRng::seed_from_u64(999);
    let results = MultiScaleMutator::mutate_chromosome(&mut g, 1.0, &mut rng);
    let inv_count = results
        .iter()
        .filter(|r| matches!(r.scale, MutationScale::Chromosome))
        .count();
    assert!(inv_count <= 1);
    if inv_count == 1 {
        assert!(g.chromosome_maternal.len() > 0);
    }
}

#[test]
fn genome_mutation_fission_fusion() {
    let mut g = test_genome();
    let mut rng = StdRng::seed_from_u64(42);
    let results = MultiScaleMutator::mutate_genome(&mut g, 1.0, &mut rng);
    assert!(results.len() <= 1);
    if let Some(r) = results.first() {
        assert_eq!(r.scale, MutationScale::Genome);
    }
}

#[test]
fn multi_scale_full() {
    let mut g = test_genome();
    let mut rng = StdRng::seed_from_u64(42);
    let rates = MutationRates::default();
    let results = MultiScaleMutator::mutate_multi_scale(&mut g, &rates, &mut rng);
    assert!(!results.is_empty());
    for r in &results {
        assert!(r.successful);
        assert!(r.positions_changed > 0);
    }
}

#[test]
fn mutation_rates_default() {
    let rates = MutationRates::default();
    assert!(rates.nucleotide > rates.codon);
    assert!(rates.codon > rates.gene);
    assert!(rates.gene > rates.segment);
    assert!(rates.segment > rates.chromosome);
    assert!(rates.chromosome > rates.genome);
}