//! Expérience P3 : recherche évolutionnaire des mécanismes du soi.
//! Usage: cargo run -p genos-orchestrator --example self_evolution_experiment

use genos_orchestrator::self_evolution::{
    run_self_evolution_experiment, EnvironmentKind, SELF_GENES,
};

fn main() {
    let seeds = [42u64, 1337, 2026];
    let reports = run_self_evolution_experiment(&seeds);

    println!("════════════════════════════════════════════════════════════");
    println!(" P3 — Recherche évolutionnaire des mécanismes du soi");
    println!(" 3 seeds × 4 environnements × 40 générations × 24 individus");
    println!("════════════════════════════════════════════════════════════\n");

    // Agréger par environnement
    let kinds = [
        ("Hostile", EnvironmentKind::Hostile),
        ("Predictable", EnvironmentKind::Predictable),
        ("Deceptive", EnvironmentKind::Deceptive),
        ("Volatile", EnvironmentKind::Volatile),
    ];

    for (label, kind) in &kinds {
        let runs: Vec<_> = reports.iter().filter(|r| r.kind == *kind).collect();
        println!("── {} ({} seeds) ──────────────────────────────", label, runs.len());
        println!("  {:<16} {:>8}  (fitness évolutive vs prescrite)", "strate", "activation");
        for (i, name) in SELF_GENES.iter().enumerate() {
            let mean: f64 = runs.iter().map(|r| r.mean_activation[i].1).sum::<f64>() / runs.len() as f64;
            let bar = "█".repeat((mean * 20.0) as usize);
            println!("  {:<16} {:>6.2}  {}", name, mean, bar);
        }
        let evo: f64 = runs.iter().map(|r| r.mean_fitness).sum::<f64>() / runs.len() as f64;
        let pres: f64 = runs.iter().map(|r| r.prescribed_fitness).sum::<f64>() / runs.len() as f64;
        println!("  fitness évoluée: {:.3} | prescrite (tout=1.0): {:.3} | Δ: {:+.3}\n", evo, pres, evo - pres);
    }

    // Verdict global
    println!("════════════════════════════════════════════════════════════");
    println!(" VERDICT — strates sélectionnées (>0.5) / rejetées (<0.2) :");
    for (label, kind) in &kinds {
        let run = reports.iter().find(|r| r.kind == *kind).unwrap();
        println!("  {:<12} sélectionnées: {:?} | rejetées: {:?}",
            label,
            run.selected_strata,
            run.rejected_strata
        );
    }
}
