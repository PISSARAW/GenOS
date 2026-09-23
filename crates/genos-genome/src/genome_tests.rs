use super::*;
use crate::gene::Gene;
use rand::SeedableRng;

#[test]
fn test_yamanaka_reprogramming() {
    let mut genome = Genome::new("ATGC");

    let mut gene1 = Gene::new("HOX_A1", "ATGC");
    gene1.chromatin_state = ChromatinState::HeterochromatinFacultative;
    gene1.developmentally_locked = true;
    gene1.is_methylated = true;

    let mut gene2 = Gene::new("HOUSEKEEPING_1", "ATGC");
    gene2.chromatin_state = ChromatinState::Euchromatin;
    gene2.developmentally_locked = false;
    gene2.is_methylated = false;

    let mut gene3 = Gene::new("VIRAL_INSERT", "ATGC");
    gene3.chromatin_state = ChromatinState::HeterochromatinConstitutive;
    gene3.developmentally_locked = true;
    gene3.is_methylated = true;

    genome.insert_gene(gene1);
    genome.insert_gene(gene2);
    genome.insert_gene(gene3);

    let cocktail = YamanakaCocktail {
        chromatin_decondensation_rate: 1.0,
        synaptic_retention_ratio: 0.9,
        target_potency: "Pluripotent".to_string(),
    };

    genome.reprogram_epigenetics(&cocktail);

    // gene1 (Facultative) should be reprogrammed
    let g1 = genome.genes.get("HOX_A1").unwrap();
    assert_eq!(g1.chromatin_state, ChromatinState::Euchromatin);
    assert_eq!(g1.developmentally_locked, false);
    assert_eq!(g1.is_methylated, false);

    let g1 = genome.genes.get("HOX_A1").unwrap();
    assert_eq!(g1.bound_repressor, None);
    assert_eq!(g1.expression_volume, 1.0);

    // gene2 (Euchromatin) should be untouched
    let g2 = genome.genes.get("HOUSEKEEPING_1").unwrap();
    assert_eq!(g2.chromatin_state, ChromatinState::Euchromatin);
    assert_eq!(g2.developmentally_locked, false);
    assert_eq!(g2.is_methylated, false);

    // gene3 (Constitutive) should be untouched
    let g3 = genome.genes.get("VIRAL_INSERT").unwrap();
    assert_eq!(
        g3.chromatin_state,
        ChromatinState::HeterochromatinConstitutive
    );
    assert_eq!(g3.developmentally_locked, true);
    assert_eq!(g3.is_methylated, true);
}

#[test]
fn test_validation_rejects_empty_chromosome() {
    let mut genome = Genome::new("VALIDATE");
    genome.chromosome_maternal.replace_sequence(Vec::new());
    assert!(genome.validate().is_err());
}

#[test]
fn test_validation_rejects_invalid_gene_exon_range() {
    let mut genome = Genome::new("VALIDATE");
    let mut gene = Gene::new("GENE", "DNA");
    gene.default_exons.push((0, gene.dna.len() + 1));
    genome.insert_gene(gene);
    assert!(genome.validate().is_err());
}

#[test]
fn test_double_strand_repair_replaces_the_broken_region() {
    let mut genome = Genome::new("REPAIR");
    genome.chromosome_maternal.replace_sequence(vec![
        crate::dna::DnaNucleotide::A,
        crate::dna::DnaNucleotide::A,
        crate::dna::DnaNucleotide::A,
        crate::dna::DnaNucleotide::A,
    ]);
    genome.chromosome_paternal.replace_sequence(vec![
        crate::dna::DnaNucleotide::C,
        crate::dna::DnaNucleotide::G,
        crate::dna::DnaNucleotide::T,
        crate::dna::DnaNucleotide::C,
    ]);
    genome.repair_double_strand_break(true, 1..3);
    assert_eq!(
        genome.chromosome_maternal.as_slice(),
        vec![
            crate::dna::DnaNucleotide::A,
            crate::dna::DnaNucleotide::G,
            crate::dna::DnaNucleotide::T,
            crate::dna::DnaNucleotide::A,
        ]
    );
}

#[test]
fn test_fingerprint_detects_genome_mutation() {
    let mut genome = Genome::new("IMMUTABLE");
    let fingerprint = genome.fingerprint().unwrap();
    assert!(genome.verify_fingerprint(&fingerprint));
    genome.insert_gene(Gene::new("MUTATED", "ATGC"));
    assert!(!genome.verify_fingerprint(&fingerprint));
}

#[test]
fn test_content_hash_ignores_identity_but_detects_content() {
    let genome = Genome::new("CONTENT");
    let child = genome.derive_child();
    assert_eq!(genome.content_hash(), child.content_hash());
    assert_ne!(genome.genome_id(), child.genome_id());
}

#[test]
fn derived_child_carries_parent_generation_and_ploidy() {
    let genome = Genome::new("IDENTITY");
    let child = genome.derive_child();
    assert_eq!(child.parent_ids, vec![genome.genome_id()]);
    assert_eq!(child.generation, 1);
    assert_eq!(child.ploidy, "diploid");
}

#[test]
fn hypermutation_with_zero_rate_does_not_mutate() {
    let mut genome = Genome::new("HYPERMUTATION_ZERO_RATE");
    let before = genome.content_hash();
    let mut rng = rand::rngs::StdRng::seed_from_u64(7);

    assert_eq!(genome.hypermutate(0.0, &mut rng), 0);
    assert_eq!(genome.content_hash(), before);
}

#[test]
fn reproductive_child_partially_resets_facultative_epigenetics() {
    let mut genome = Genome::new("EPIGENETIC");
    let mut facultative = Gene::new("FACULTATIVE", "ATGC");
    facultative.chromatin_state = ChromatinState::HeterochromatinFacultative;
    facultative.is_methylated = true;
    facultative.developmentally_locked = true;
    facultative.bound_repressor = Some("REPRESSOR".to_string());
    facultative.expression_volume = 0.2;
    let mut constitutive = Gene::new("CONSTITUTIVE", "ATGC");
    constitutive.chromatin_state = ChromatinState::HeterochromatinConstitutive;
    constitutive.is_methylated = true;
    genome.insert_gene(facultative);
    genome.insert_gene(constitutive);

    let child = genome.derive_reproductive_child();
    let facultative = child.genes.get("FACULTATIVE").unwrap();
    assert_eq!(facultative.chromatin_state, ChromatinState::Euchromatin);
    assert!(!facultative.is_methylated);
    assert!(!facultative.developmentally_locked);
    assert_eq!(facultative.bound_repressor, None);
    assert_eq!(facultative.expression_volume, 1.0);
    assert!(child.genes.get("CONSTITUTIVE").unwrap().is_methylated);
    assert_eq!(
        child.genes.get("CONSTITUTIVE").unwrap().chromatin_state,
        ChromatinState::HeterochromatinConstitutive
    );
}

#[test]
fn instinct_loci_are_exempt_from_stochastic_mutation() {
    let mut genome = Genome::new("INSTINCT_SHIELD");
    let locus = format!("{INSTINCT_LOCUS_PREFIX}FORAGE_RETURN");
    let mut instinct = Gene::new(&locus, "AGTCAGTCAGTC");
    instinct.developmentally_locked = true;
    genome.insert_gene(instinct);
    genome.insert_gene(Gene::new("SOMATIC_GENE", "AGTCAGTCAGTC"));
    let instinct_before = genome.genes.get(&locus).unwrap().dna.clone();
    let mut rng = rand::rngs::StdRng::seed_from_u64(11);
    let _ = genome.mutate_stochastic(0.9, &mut rng);
    assert_eq!(&instinct_before, &genome.genes.get(&locus).unwrap().dna);
}

#[test]
fn test_genome_mutate_stochastic_and_hypermutate() {
    let mut genome = Genome::new("MUTATION_TEST");
    genome.insert_gene(Gene::new("TEST_GENE", "AGTCAGTCAGTC"));
    let mut rng = rand::rng();

    let initial_hash = genome.content_hash();
    let mutations_zero = genome.mutate_stochastic(0.0, &mut rng);
    assert_eq!(mutations_zero, 0);
    assert_eq!(genome.content_hash(), initial_hash);

    let mutations = genome.mutate_stochastic(0.3, &mut rng);
    assert!(mutations > 0);
    assert_ne!(genome.content_hash(), initial_hash);

    let hyper_mutations = genome.hypermutate(0.2, &mut rng);
    assert!(hyper_mutations > 0);
}

#[test]
fn clone_produces_identical_chromosome_sequences() {
    let mut genome = Genome::new("CLONE_TEST");
    genome.insert_gene(Gene::new("GENE_A", "ATGC"));
    let clone = genome.clone_with_new_id(Uuid::new_v4());
    assert_eq!(
        genome.chromosome_maternal.as_slice(),
        clone.chromosome_maternal.as_slice()
    );
    assert_eq!(
        genome.chromosome_paternal.as_slice(),
        clone.chromosome_paternal.as_slice()
    );
}

#[test]
fn clone_produces_new_genome_id() {
    let genome = Genome::new("CLONE_TEST");
    let clone = genome.clone_with_new_id(Uuid::new_v4());
    assert_ne!(genome.genome_id(), clone.genome_id());
}

#[test]
fn clone_parent_ids_contains_original_genome_id() {
    let genome = Genome::new("CLONE_TEST");
    let clone = genome.clone_with_new_id(Uuid::new_v4());
    assert_eq!(clone.parent_ids, vec![genome.genome_id()]);
}

#[test]
fn clone_generation_equals_original_generation() {
    let genome = Genome::new("CLONE_TEST");
    let clone = genome.clone_with_new_id(Uuid::new_v4());
    assert_eq!(clone.generation, genome.generation.saturating_add(1));
}

#[test]
fn clone_gene_count_equals_original_gene_count() {
    let mut genome = Genome::new("CLONE_TEST");
    genome.insert_gene(Gene::new("GENE_A", "ATGC"));
    genome.insert_gene(Gene::new("GENE_B", "CGTA"));
    let clone = genome.clone_with_new_id(Uuid::new_v4());
    assert_eq!(clone.genes.len(), genome.genes.len());
}
