use super::*;
fn genome() -> Genome {
    let mut g = Genome::new("PHASE_D_TEST");
    let gene = crate::gene::Gene::new("PD_GENE", "ATGCATGCATGC");
    g.insert_gene(gene);
    g
}

#[test]
fn experimental_fitness_measure() {
    let mut ef = ExperimentalFitness::new();
    let g = genome();
    let score = ef.measure(&g, "task1");
    assert!(score >= 0.0);
}

#[test]
fn experimental_fitness_significance() {
    let mut ef = ExperimentalFitness::new();
    let g = genome();
    for _ in 0..4 {
        ef.measure(&g, "task1");
    }
    assert!(ef.is_significant("task1", 0.5));
}

#[test]
fn experimental_fitness_ablation() {
    let mut ef = ExperimentalFitness::new();
    let g = genome();
    let score = ef.ablate_and_measure(&g, "task1");
    assert!(score >= 0.0);
}

#[test]
fn qd_engine_expand() {
    let mut engine = QDDiversityEngine::new(vec![]);
    let mut g = genome();
    g.extra_chromosomes
        .push(crate::dna::DnaStrand::synthesize("ATGCATGCATGCATGCATGC"));
    let expanded = engine.expand_if_needed(&g, "far_genome");
    assert!(expanded);
    assert_eq!(engine.coverage().1, 1);
}

#[test]
fn qd_engine_insert() {
    let mut engine = QDDiversityEngine::new(vec![Niche {
        id: "n1".into(),
        center: vec![1.0, 1.0, 0.0],
        radius: 5.0,
        occupant: None,
        best_fitness: 0.0,
    }]);
    let g = genome();
    let inserted = engine.evaluate_and_insert(QdCandidate {
        genome: &g,
        id: "g1",
        fitness: 50.0,
    });
    assert!(inserted);
}

#[test]
fn environment_shift() {
    let mut env = EnvironmentManager::new(vec!["a".into(), "b".into()]);
    env.shift_to_next_phase();
    assert_eq!(env.phase, 1);
}

#[test]
fn operator_pool_adapt_low_diversity() {
    let mut pool = EvolutionaryOperatorPool::new();
    let initial = pool.crossover_rate;
    pool.adapt(0.1, -0.5);
    assert!(pool.crossover_rate > initial);
}

#[test]
fn phase_d_cycle_evaluate() {
    let mut cycle = PhaseDCycle::new(vec!["t1".into(), "t2".into()]);
    let pop = vec![genome(), genome()];
    let scores = cycle.evaluate(&pop);
    assert_eq!(scores.len(), 2);
}

#[test]
fn phase_d_cycle_shift_and_adapt() {
    let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
    cycle.shift_environment();
    cycle.adapt_operators(0.1, -0.3);
    assert_eq!(cycle.env.phase, 1);
}
