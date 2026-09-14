use genos_orchestrator::Population;

fn toward_zero(genes: &[f64]) -> f64 {
    -genes.iter().map(|g| g * g).sum::<f64>()
}

#[test]
fn l_evolution_ameliore_la_fitness() {
    let mut pop = Population::new(&["A", "B"], 8, 4, 42);
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
    let mut pop = Population::new(&["A", "B", "C"], 6, 3, 7);
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
    let mut a = Population::new(&["X", "Y"], 6, 4, 1234);
    let mut b = Population::new(&["X", "Y"], 6, 4, 1234);
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
