use genos_core::{GenomeId, SnapshotId};
use genos_runtime::{
    run_security_coevolution, SecurityCoevolutionConfig, SecurityCoevolutionManifest,
    SecurityGenes, SecurityPopulation, SecurityScenarioSpec,
};
use std::collections::HashSet;

fn scenario(id: &str) -> SecurityScenarioSpec {
    SecurityScenarioSpec {
        id: id.to_string(),
        attack_tactic: format!("attack-{id}"),
        defense_tactic: format!("defense-{id}"),
        baseline_risk: 0.7,
        red_genes: SecurityGenes {
            effectiveness: 0.6,
            adaptability: 0.5,
            precision: 0.6,
        },
        blue_genes: SecurityGenes {
            effectiveness: 0.55,
            adaptability: 0.5,
            precision: 0.7,
        },
    }
}

#[test]
fn red_and_blue_genomes_coevolve_with_neutral_observers_and_traceable_parents() {
    let report = run_security_coevolution(SecurityCoevolutionManifest {
        name: "security-test".to_string(),
        snapshot_ref: "world-0".to_string(),
        scenarios: vec![scenario("phishing"), scenario("dependency")],
        config: SecurityCoevolutionConfig {
            seed: 42,
            generations: 5,
            mutations_per_parent: 3,
            mutation_scale: 0.1,
        },
    })
    .expect("coevolution failed");

    assert_eq!(report.initial_worlds.len(), 2);
    assert_eq!(
        report
            .world_lineage
            .children_of(&SnapshotId("world-0".to_string()))
            .len(),
        2
    );
    assert_eq!(report.evolution.len(), 10);
    assert_eq!(report.total_genomes_evaluated, 66);
    assert!(report.evolution.iter().all(|generation| {
        generation.red_candidates.len() == 3
            && generation.blue_candidates.len() == 3
            && generation
                .red_candidates
                .iter()
                .filter(|candidate| candidate.selected)
                .count()
                == 1
            && generation
                .blue_candidates
                .iter()
                .filter(|candidate| candidate.selected)
                .count()
                == 1
    }));
    assert!(report
        .evolution
        .iter()
        .flat_map(|generation| {
            generation
                .red_candidates
                .iter()
                .chain(&generation.blue_candidates)
        })
        .all(|candidate| {
            candidate.genome.parent_genome.is_some()
                && candidate.genome.mutation.is_some()
                && (0.0..=1.0).contains(&candidate.genome.genes.effectiveness)
                && (0.0..=1.0).contains(&candidate.genome.genes.adaptability)
                && (0.0..=1.0).contains(&candidate.genome.genes.precision)
        }));

    let initial_observers = report
        .initial_worlds
        .iter()
        .map(|world| (world.scenario_id.clone(), world.observer.genome_id.clone()))
        .collect::<std::collections::HashMap<_, _>>();
    assert!(report.final_worlds.iter().all(|world| {
        world.observer.population == SecurityPopulation::Observer
            && initial_observers.get(&world.scenario_id) == Some(&world.observer.genome_id)
            && world.observer.parent_genome.is_none()
    }));
    assert!(report.evolution.iter().all(|generation| {
        (0.0..=1.0).contains(&generation.observer_finding.breach_probability)
            && (0.0..=1.0).contains(&generation.observer_finding.defense_utility)
    }));

    let all_ids = report
        .evolution
        .iter()
        .flat_map(|generation| {
            generation
                .red_candidates
                .iter()
                .chain(&generation.blue_candidates)
        })
        .map(|candidate| candidate.genome.genome_id.clone())
        .collect::<Vec<GenomeId>>();
    assert_eq!(all_ids.iter().collect::<HashSet<_>>().len(), all_ids.len());
}

#[test]
fn same_seed_and_manifest_reproduce_the_same_evolution() {
    let manifest = SecurityCoevolutionManifest {
        name: "deterministic-security".to_string(),
        snapshot_ref: "world-0".to_string(),
        scenarios: vec![scenario("lateral")],
        config: SecurityCoevolutionConfig {
            seed: 99,
            generations: 8,
            mutations_per_parent: 3,
            mutation_scale: 0.08,
        },
    };
    let first = run_security_coevolution(manifest.clone()).unwrap();
    let second = run_security_coevolution(manifest).unwrap();

    assert_eq!(first.evolution, second.evolution);
    assert_eq!(first.final_worlds, second.final_worlds);
}
