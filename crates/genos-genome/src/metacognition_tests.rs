use super::*;
fn genome() -> crate::genome::Genome {
    let mut g = crate::genome::Genome::new("PHASE_F_TEST");
    let gene = crate::gene::Gene::new("PF_GENE", "ATGCATGCATGC");
    g.insert_gene(gene);
    g
}

fn biased_cycle() -> PhaseDCycle {
    let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
    cycle.record_operator_use("mutation", 10);
    cycle
}

#[test]
fn self_model_detects_stagnation_in_flat_trajectory() {
    let mut model = EvolutionarySelfModel::new();
    for i in 0..6 {
        let mut snap = GenerationSnapshot::new(i, 10.0, 5.0);
        snap.best_fitness = 10.0;
        model.record(snap);
    }
    assert!(model.detect_stagnation(5));
}

#[test]
fn self_model_detects_loop_in_repeating_trajectory() {
    let mut model = EvolutionarySelfModel::new();
    for _ in 0..2 {
        for i in 0..3 {
            let mut snap = GenerationSnapshot::new(i, 5.0, 2.0);
            snap.best_fitness = 5.0 + i as f64 * 0.00001;
            model.record(snap);
        }
    }
    assert!(model.detect_loop());
}

#[test]
fn metacognition_returns_stagnation_for_flat_inputs() {
    let mut engine = MetacognitionEngine::new();
    let cycle = PhaseDCycle::new(vec!["t1".into()]);
    let mut detected = false;
    for i in 0..10 {
        let signals = engine.monitor(&mut cycle.clone(), i);
        if signals.contains(&CognitiveSignal::StagnationDetected) {
            detected = true;
            break;
        }
    }
    assert!(detected);
}

#[test]
fn adjustment_modifies_operator_probabilities() {
    let engine = MetacognitionEngine::new();
    let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
    let initial_rate = cycle.operators_mut().crossover_rate;
    engine.apply_adjustment(Adjustment::SwitchOperators, &mut cycle);
    let new_rate = cycle.operators_mut().crossover_rate;
    assert_ne!(initial_rate, new_rate);
}

#[test]
fn self_model_no_stagnation_with_progress() {
    let mut model = EvolutionarySelfModel::new();
    for i in 0..6 {
        let snap = GenerationSnapshot::new(i, 10.0 + i as f64, 5.0);
        model.record(snap);
    }
    assert!(!model.detect_stagnation(5));
}

#[test]
fn detect_bias_returns_zero_when_empty() {
    let model = EvolutionarySelfModel::new();
    assert_eq!(model.detect_bias(), 0.0);
}

#[test]
fn monitor_records_real_fitness_not_zeros() {
    let mut engine = MetacognitionEngine::new();
    let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
    let pop = vec![genome(), genome()];
    cycle.evaluate(&pop);
    engine.monitor(&mut cycle, 0);
    let snap = engine.model().trajectory.last().unwrap();
    assert!(
        snap.best_fitness > 0.0,
        "best_fitness must come from real evaluation, got {}",
        snap.best_fitness
    );
    assert!(snap.mean_fitness > 0.0);
}

#[test]
fn monitor_records_operator_usage() {
    let mut engine = MetacognitionEngine::new();
    let mut cycle = biased_cycle();
    engine.monitor(&mut cycle, 0);
    let snap = engine.model().trajectory.last().unwrap();
    assert_eq!(snap.operator_usage.get("mutation"), Some(&10));
}

#[test]
fn detect_bias_aggregates_across_generations() {
    let mut model = EvolutionarySelfModel::new();
    for generation in 0..3 {
        let mut snap = GenerationSnapshot::new(generation, 10.0, 5.0);
        snap.operator_usage.insert("mutation".into(), 10);
        snap.operator_usage.insert("crossover".into(), 1);
        model.record(snap);
    }
    // Agrégé : mutation=30, crossover=3 → 30/33 ≈ 0.909 > 0.7
    let bias = model.detect_bias();
    assert!(
        bias > 0.85,
        "aggregated bias must be detected, got {}",
        bias
    );
}

#[test]
fn detect_bias_not_inflated_by_single_generation_max() {
    let mut model = EvolutionarySelfModel::new();
    for generation in 0..3 {
        let mut snap = GenerationSnapshot::new(generation, 10.0, 5.0);
        snap.operator_usage.insert("mutation".into(), 10);
        snap.operator_usage.insert("crossover".into(), 10);
        model.record(snap);
    }
    // Agrégé : mutation=30, crossover=30 → 30/60 = 0.5 < 0.7
    let bias = model.detect_bias();
    assert!(
        bias < 0.7,
        "balanced usage must not be flagged as biased, got {}",
        bias
    );
}

#[test]
fn apply_reduce_bias_works_on_pool() {
    let engine = MetacognitionEngine::new();
    let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
    let initial = cycle.operators_mut().crossover_rate;
    engine.apply_adjustment(Adjustment::ReduceBias, &mut cycle);
    let after = cycle.operators_mut().crossover_rate;
    assert!(after > initial, "reduce_bias must raise crossover rate");
}

#[test]
fn monitor_diversity_signals_use_snapshot() {
    let mut engine = MetacognitionEngine::new();
    let mut cycle = biased_cycle();
    let signals = engine.monitor(&mut cycle, 0);
    // Pas de fitness enregistré → pas de stagnation ; usage biaisé présent.
    assert!(signals.is_empty() || signals.contains(&CognitiveSignal::BiasDetected));
}

#[test]
fn run_cycle_executes_full_metacognitive_loop() {
    let mut engine = MetacognitionEngine::new();
    let mut cycle = PhaseDCycle::new(vec!["t1".into()]);
    let population = vec![genome(), genome()];
    let report = engine.run_cycle(&mut cycle, &population);
    assert_eq!(report.generation, 1);
    assert_eq!(engine.generation(), 1);
    // Fitness réels observés, plus jamais 0.0 par construction.
    assert!(report.best_fitness > 0.0, "got {}", report.best_fitness);
    assert_eq!(report.scores.len(), 2);
    // La trajectoire interne contient le snapshot de cette génération.
    assert_eq!(engine.model().trajectory_len(), 1);
    // Deuxième génération : la boucle tourne de façon continue.
    let report2 = engine.run_cycle(&mut cycle, &population);
    assert_eq!(report2.generation, 2);
    assert_eq!(engine.model().trajectory_len(), 2);
}
