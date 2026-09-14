//! MISSION de bout en bout : menace virale + agents malades + incertitude.
//!
//! Le scénario force l'orchestrateur à mobiliser la **feinte** (ADN leurre),
//! le **pipeline glial** complet et la **communication** (thalamus), tout en
//! menant la mission jusqu'au bout. La seconde partie exécute trois mondes
//! **isolés réels** (un `GenosEcosystem` chacun) en parallèle.

use genos_orchestrator::genos_cell::{AgentCell, Pathology};
use genos_orchestrator::{GenosEcosystem, Goal, Hypothesis, Multiverse};

fn build_scenario(name: &str, diseased: usize, virions: usize, uncertain: bool) -> GenosEcosystem {
    let mut eco = GenosEcosystem::new(name);
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let genome = genos_orchestrator::genos_genome::Genome::new("BASE");
    let dna = genos_orchestrator::dna_ops::from_genome(&genome, "seed");
    let healthy = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("sain", "h", "Worker"))
        .unwrap();
    eco.register_dna(healthy, dna.clone());
    for i in 0..diseased {
        let mut sick = AgentCell::new(format!("patient_{i}"), "s", "Worker");
        sick.clinical
            .diagnose(Pathology::CytokineStorm { il6_level: 10.0 });
        if let Ok(id) = eco.orchestrator.add_worker("Arena", sick) {
            eco.register_dna(id, dna.clone());
        }
    }
    for i in 0..virions {
        eco.virology
            .synthesize_bacteriophage(&format!("SPIKE_{i}"), "KILL");
    }
    if !uncertain {
        eco.record_event("INTEL", serde_json::json!({}));
    }
    eco
}

fn main() {
    println!("=== MISSION de bout en bout : feinte + glie + thalamus ===\n");

    // --- Partie A : boucle complète sur un écosystème ---
    let mut eco = build_scenario("Griot_Prime", 2, 2, true);
    let report = eco.run(&Goal::SecurePerimeter, 8);
    println!("[RUN] ticks={} halted={} atteint={}", report.ticks, report.halted, report.reached);
    println!("      concepts execs : {:?}", report.executed);
    println!("      verdicts={} traces={} agents {} -> {}",
        report.verdicts, report.traces, report.agents_before, report.agents_after);

    let answer = eco.communicate("Ping");
    println!("[THALAMUS] reponse = {answer}");

    let names: Vec<String> = report.executed.iter().map(|c| format!("{c:?}")).collect();
    assert!(names.contains(&"Feign".to_string()), "feinte attendue : {names:?}");
    assert!(names.contains(&"Glia".to_string()), "glie attendue : {names:?}");
    assert!(names.contains(&"Communicate".to_string()), "communication attendue : {names:?}");
    assert!(report.reached);

    // --- Partie B : trois mondes isolés réels en parallèle ---
    println!("\n[MONDES ISOLES] Trinity (un écosystème par monde) :");
    let build = |hypothesis: Hypothesis| match hypothesis {
        Hypothesis::Basic => build_scenario("Basic", 0, 0, false),
        Hypothesis::Planned => build_scenario("Planned", 1, 1, false),
        _ => build_scenario("SelfCorrecting", 2, 2, true),
    };
    let result = Multiverse::run_isolated(&Goal::SecurePerimeter, &Hypothesis::trinity(), build);
    for world in &result.worlds {
        println!(
            "    {:<14} org={:<26} etapes={:<2} progression={:.2} atteint={}",
            world.hypothesis.name(),
            world.organization,
            world.steps.len(),
            world.progress,
            world.reached
        );
    }
    println!("    barriere : {}", result.reason);
    assert_eq!(result.worlds.len(), 3);

    println!("\nMISSION BOUT EN BOUT VALIDEE");
}
