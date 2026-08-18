use super::*;
use genos_core::GenomeId;

fn dummy_genome() -> genos_core::AgentGenome {
    serde_json::from_str(r#"{
        "id": "test_id",
        "version": "1.0",
        "identity": { "name": "test", "role": "test" },
        "cognition": { "planning_depth": 1, "chromosomes": [] },
        "objectives": [],
        "policies": [],
        "capabilities": [],
        "memory_policy": { "working_max_items": 1, "episodic_enabled": false, "semantic_enabled": false },
        "model_policy": { "strategy": "default", "preferred_providers": [], "allow_local": true },
        "tool_policy": { "permissions": [] }
    }"#).unwrap()
}

#[test]
fn test_gene_conversion_dominant_alice() {
    let mut alice = dummy_genome();
    alice.id = genos_core::ids::GenomeId::new();
    alice.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.1, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.2, epigenetic_marker: 0.0 },
        ],
    }];
    let mut bob = dummy_genome();
    bob.id = genos_core::ids::GenomeId::new();
    bob.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.9, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.8, epigenetic_marker: 0.0 },
        ],
    }];

    let target = genos_eval::RecombinedTraitTarget {
        trait_name: "A".to_string(),
        target: 0.5,
        parent_a_weight: 0.5,
        parent_a_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
        parent_b_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
    };

    let strategy = genos_core::RecombinationStrategy::GeneConversion {
        dominant_parent: "alice".to_string(),
    };
    let child = breed_genomes(
        &alice,
        &bob,
        "child",
        &[BreedingTraitMapping {
            genome_field: "cognition.drives.A".to_string(),
            target,
        }],
        &strategy,
        None,
        &[],
    )
    .unwrap();
    assert_eq!(child.cognition.chromosomes[0].loci[0].value, 0.1);
    assert_eq!(child.cognition.chromosomes[0].loci[1].value, 0.2);
}

#[test]
fn test_gene_conversion_dominant_bob() {
    let mut alice = dummy_genome();
    alice.id = genos_core::ids::GenomeId::new();
    alice.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.1, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.2, epigenetic_marker: 0.0 },
        ],
    }];
    let mut bob = dummy_genome();
    bob.id = genos_core::ids::GenomeId::new();
    bob.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.9, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.8, epigenetic_marker: 0.0 },
        ],
    }];

    let target = genos_eval::RecombinedTraitTarget {
        trait_name: "A".to_string(),
        target: 0.5,
        parent_a_weight: 0.5,
        parent_a_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
        parent_b_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
    };

    let strategy = genos_core::RecombinationStrategy::GeneConversion {
        dominant_parent: "bob".to_string(),
    };
    let child = breed_genomes(
        &alice,
        &bob,
        "child",
        &[BreedingTraitMapping {
            genome_field: "cognition.drives.A".to_string(),
            target,
        }],
        &strategy,
        None,
        &[],
    )
    .unwrap();
    assert_eq!(child.cognition.chromosomes[0].loci[0].value, 0.9);
    assert_eq!(child.cognition.chromosomes[0].loci[1].value, 0.8);
}

#[test]
fn test_nhej_deterministic_prng() {
    let mut alice = dummy_genome();
    alice.id = genos_core::ids::GenomeId::new();
    alice.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.1, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.2, epigenetic_marker: 0.0 },
        ],
    }];
    let mut bob = dummy_genome();
    bob.id = genos_core::ids::GenomeId::new();
    bob.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.9, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.8, epigenetic_marker: 0.0 },
        ],
    }];

    let target1 = genos_eval::RecombinedTraitTarget {
        trait_name: "A".to_string(),
        target: 0.5,
        parent_a_weight: 0.5,
        parent_a_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
        parent_b_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
    };
    let target2 = target1.clone();

    let strategy = genos_core::RecombinationStrategy::NonHomologousEndJoining { error_rate: 1.0 };
    let child1 = breed_genomes(
        &alice,
        &bob,
        "child1",
        &[BreedingTraitMapping {
            genome_field: "cognition.drives.A".to_string(),
            target: target1,
        }],
        &strategy,
        None,
        &[],
    )
    .unwrap();
    let child2 = breed_genomes(
        &alice,
        &bob,
        "child2",
        &[BreedingTraitMapping {
            genome_field: "cognition.drives.A".to_string(),
            target: target2,
        }],
        &strategy,
        None,
        &[],
    )
    .unwrap();

    assert_eq!(
        child1.cognition.chromosomes[0].loci[0].value,
        child2.cognition.chromosomes[0].loci[0].value
    );
    assert_eq!(
        child1.cognition.chromosomes[0].loci[1].value,
        child2.cognition.chromosomes[0].loci[1].value
    );
    assert_ne!(child1.cognition.chromosomes[0].loci[0].value, 0.1);
}

#[test]
fn test_site_specific() {
    let mut alice = dummy_genome();
    alice.id = genos_core::ids::GenomeId::new();
    alice.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.1, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.2, epigenetic_marker: 0.0 },
        ],
    }];
    let mut bob = dummy_genome();
    bob.id = genos_core::ids::GenomeId::new();
    bob.cognition.chromosomes = vec![genos_core::Chromosome {
        name: "C1".to_string(),
        loci: vec![
            genos_core::Locus { gene_name: "A".to_string(), value: 0.9, epigenetic_marker: 0.0 },
            genos_core::Locus { gene_name: "B".to_string(), value: 0.8, epigenetic_marker: 0.0 },
        ],
    }];

    let target = genos_eval::RecombinedTraitTarget {
        trait_name: "A".to_string(),
        target: 0.5,
        parent_a_weight: 0.5,
        parent_a_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
        parent_b_estimate: genos_eval::TraitEstimate {
            trait_name: "A".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
    };

    let strategy = genos_core::RecombinationStrategy::SiteSpecific {
        target_genes: vec!["B".to_string()],
    };
    let child = breed_genomes(
        &alice,
        &bob,
        "child",
        &[BreedingTraitMapping {
            genome_field: "cognition.drives.A".to_string(),
            target,
        }],
        &strategy,
        None,
        &[],
    )
    .unwrap();
    assert_eq!(child.cognition.chromosomes[0].loci[0].value, 0.1);
    assert_eq!(child.cognition.chromosomes[0].loci[1].value, 0.8);
}

#[test]
fn test_run_breeding_program_loop() {
    let mut alice = dummy_genome();
    alice.id = GenomeId("gen_0_id_1".to_string());
    let mut bob = dummy_genome();
    bob.id = GenomeId("gen_0_id_2".to_string());
    let mut charlie = dummy_genome();
    charlie.id = GenomeId("gen_0_id_3".to_string());

    let initial_population = vec![alice, bob, charlie];
    let constraints = SelectionConstraints {
        max_cost: 100.0,
        max_risk: 100.0,
        max_hallucinations: 100.0,
        min_success: 0.0,
    };
    let strategy = genos_core::RecombinationStrategy::HomologousRecombination;
    let mappings = vec![BreedingTraitMapping {
        genome_field: "cognition.drives.A".to_string(),
        target: genos_eval::RecombinedTraitTarget {
            trait_name: "A".to_string(),
            target: 0.5,
            parent_a_weight: 0.5,
            parent_a_estimate: genos_eval::TraitEstimate {
                trait_name: "A".to_string(),
                mean: 0.5,
                standard_error: 0.1,
                sample_size: 1,
                evaluation_suite: "suite".to_string(),
            },
            parent_b_estimate: genos_eval::TraitEstimate {
                trait_name: "A".to_string(),
                mean: 0.5,
                standard_error: 0.1,
                sample_size: 1,
                evaluation_suite: "suite".to_string(),
            },
        },
    }];

    let batch_evaluator = |pop: &[genos_core::AgentGenome]| -> Vec<SelectionCandidate> {
        pop.iter()
            .enumerate()
            .map(|(i, g)| SelectionCandidate {
                genome_id: g.id.clone(),
                metrics: CanonicalAgentMetrics {
                    accuracy: 0.5 + (i as f64 * 0.1),
                    cost: 10.0,
                    tokens: 1000.0,
                    latency: 1.0,
                    tool_calls: 1.0,
                    risk: 0.1,
                    hallucinations: 0.0,
                    novelty: 0.5,
                    success: 1.0,
                },
            })
            .collect()
    };

    let result = super::run_breeding_program(
        initial_population,
        &batch_evaluator,
        &constraints,
        &strategy,
        &mappings,
        5,
        2,
        0,
        None,
    );

    assert!(result.is_ok());
    let final_pop = result.unwrap();
    assert_eq!(final_pop.len(), 5);
    let has_gen_2 = final_pop.iter().any(|g| g.id.0.starts_with("gen_2"));
    assert!(has_gen_2);
}
