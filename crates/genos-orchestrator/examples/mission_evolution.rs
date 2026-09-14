//! MISSION évolution ouverte (Phase 5) : population multi-îlots, sélection,
//! reproduction, nouveauté et migration.
//!
//! L'environnement fournit la fitness ; la sélection par tournoi, le croisement
//! uniforme + mutation et l'archive de nouveauté font progresser la population.

use genos_orchestrator::Population;

fn main() {
    println!("=== MISSION EVOLUTION OUVERTE : population multi-ilots ===\n");

    let mut pop = Population::new(&["Ile_A", "Ile_B", "Ile_C"], 10, 6, 2024);
    // Environnement : minimiser la distance à l'origine (fitness = -||g||²).
    let fitness = |genes: &[f64]| -genes.iter().map(|g| g * g).sum::<f64>();

    pop.evaluate(&fitness);
    let initial = pop.report();
    println!(
        "[GEN 0] best={:.3} mean={:.3} nouveaute={} population={}",
        initial.best_fitness, initial.mean_fitness, initial.novelty_count, initial.population
    );

    for _ in 0..30 {
        pop.generation();
        pop.evaluate(&fitness);
        if pop.generation.is_multiple_of(10) {
            let r = pop.report();
            println!(
                "[GEN {:>2}] best={:.3} mean={:.3} nouveaute={} population={}",
                r.generation, r.best_fitness, r.mean_fitness, r.novelty_count, r.population
            );
        }
    }

    let final_report = pop.report();
    let best = pop.best().expect("population non vide");
    println!(
        "\n[BEST] fitness={:.4} lignee={} genes={:?}",
        best.fitness,
        best.lineage,
        best.genes.iter().map(|g| (g * 100.0).round() / 100.0).collect::<Vec<_>>()
    );
    println!(
        "[BILAN] generations={} population={} nouveaute={}",
        final_report.generation, final_report.population, final_report.novelty_count
    );

    assert!(final_report.best_fitness > initial.best_fitness, "la fitness doit progresser");
    assert_eq!(final_report.population, 30, "taille stable apres migration");
    assert!(final_report.novelty_count > 0);
    println!("\nMISSION EVOLUTION VALIDEE");
}
