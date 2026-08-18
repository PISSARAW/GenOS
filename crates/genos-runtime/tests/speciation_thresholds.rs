use genos_core::{AgentGenome, Chromosome, Locus, RecombinationStrategy};
use genos_runtime::{breed_genomes, compute_genetic_distance, BreedingTraitMapping};
use genos_eval::{RecombinedTraitTarget, TraitEstimate};

fn dummy_genome(val1: f32, val2: f32) -> AgentGenome {
    let mut g: AgentGenome = serde_json::from_str(r#"{
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
    }"#).unwrap();

    g.cognition.chromosomes = vec![Chromosome {
        name: "chrom1".to_string(),
        loci: vec![
            Locus {
                gene_name: "trait1".to_string(),
                value: val1,
            },
            Locus {
                gene_name: "trait2".to_string(),
                value: val2,
            }
        ]
    }];
    g
}

#[test]
fn run_speciation_experiment() {
    let alice = dummy_genome(1.0, 2.0);
    let bob = dummy_genome(10.0, 5.0);

    let distance = compute_genetic_distance(&alice, &bob);
    println!("Distance between Alice and Bob: {:.3}", distance);

    let target = RecombinedTraitTarget {
        trait_name: "T".to_string(),
        target: 0.5,
        parent_a_weight: 0.5,
        parent_a_estimate: TraitEstimate {
            trait_name: "T".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
        parent_b_estimate: TraitEstimate {
            trait_name: "T".to_string(),
            mean: 0.5,
            standard_error: 0.1,
            sample_size: 1,
            evaluation_suite: "suite".to_string(),
        },
    };
    let mappings = vec![BreedingTraitMapping { genome_field: "T".to_string(), target }];
    let strategy = RecombinationStrategy::HomologousRecombination;

    let thresholds = vec![0.5, 1.0, 5.0, 10.0, 20.0];
    
    for &threshold in &thresholds {
        let result = breed_genomes(&alice, &bob, "child", &mappings, &strategy, Some(threshold));
        if let Err(e) = result {
            println!("Threshold {:.1}: Rejected ({})", threshold, e);
        } else {
            println!("Threshold {:.1}: Accepted!", threshold);
        }
    }
}
