use genos_orchestrator::{InnovationBlocked, Population, QualityProof};

fn toward_zero(genes: &[f64]) -> f64 {
    -genes.iter().map(|g| g * g).sum::<f64>()
}

#[test]
fn l_evolution_ameliore_la_fitness() {
    let mut pop = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["A", "B"].into_iter().map(String::from).collect(), per_island: 8, gene_count: 4, seed: 42 });
    pop.evaluate(&toward_zero);
    let initial_best = pop.best().unwrap().fitness;
    for _ in 0..30 {
        pop.generation();
        pop.evaluate(&toward_zero);
    }
    let final_best = pop.best().unwrap().fitness;
    assert!(
        final_best > initial_best,
        "fitness doit s'ameliorer : {initial_best} -> {final_best}"
    );
}

#[test]
fn la_nouveaute_s_accumule_et_la_population_reste_stable() {
    let mut pop = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["A", "B", "C"].into_iter().map(String::from).collect(), per_island: 6, gene_count: 3, seed: 7 });
    pop.evaluate(&toward_zero);
    for _ in 0..10 {
        pop.generation();
        pop.evaluate(&toward_zero);
    }
    let report = pop.report();
    assert_eq!(report.population, 3 * 6, "taille stable malgre migration");
    assert!(report.novelty_count > 0, "archive de nouveaute non vide");
}

#[test]
fn l_evolution_est_deterministe_a_seed_egal() {
    let mut a = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["X", "Y"].into_iter().map(String::from).collect(), per_island: 6, gene_count: 4, seed: 1234 });
    let mut b = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["X", "Y"].into_iter().map(String::from).collect(), per_island: 6, gene_count: 4, seed: 1234 });
    a.evaluate(&toward_zero);
    b.evaluate(&toward_zero);
    for _ in 0..20 {
        a.generation();
        a.evaluate(&toward_zero);
        b.generation();
        b.evaluate(&toward_zero);
    }
    assert!((a.best().unwrap().fitness - b.best().unwrap().fitness).abs() < 1e-12);
}

#[test]
fn la_boucle_innovation_selectionne_les_variantes_prouvees() {
    let mut pop = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["A"].into_iter().map(String::from).collect(), per_island: 12, gene_count: 2, seed: 99 });
    let evaluator = |genes: &[f64]| QualityProof {
        fitness: -genes.iter().map(|gene| gene * gene).sum::<f64>(),
        quality: if genes[0] >= 0.0 { 0.9 } else { 0.1 },
        reproducible: true,
        regression_free: genes[0] >= 0.0,
    };

    let report = pop.innovation_step(&evaluator, 0.8).unwrap();

    assert_eq!(report.generation, 1);
    assert!(report.verified_count > 0);
    assert!(report.rejected_count > 0);
    assert_eq!(report.population, 12);
}

#[test]
fn la_boucle_innovation_s_arrete_sans_preuve() {
    let mut pop = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["A"].into_iter().map(String::from).collect(), per_island: 4, gene_count: 2, seed: 5 });
    let result = pop.innovation_step(
        &|_| QualityProof {
            fitness: 1.0,
            quality: 0.2,
            reproducible: false,
            regression_free: false,
        },
        0.8,
    );

    assert!(matches!(
        result,
        Err(InnovationBlocked::NoVerifiedCandidate)
    ));
    assert_eq!(pop.generation, 0);
}

#[test]
fn un_cycle_evolutif_evalue_puis_reproduit() {
    let mut pop = Population::new(genos_orchestrator::evolution::NewConfig { names: vec!["A"].into_iter().map(String::from).collect(), per_island: 6, gene_count: 2, seed: 11 });
    let report = pop.evolve(&toward_zero);

    assert_eq!(report.generation, 1);
    assert_eq!(report.population, 6);
    assert!(report.novelty_count > 0);
}
