//! MISSION : observer le monde puis explorer trois mondes parallèles (Trinity).
//!
//! 1. `observe()` dérive l'état réel de l'écosystème (menace, malades, agents).
//! 2. `Multiverse::trinity()` exécute trois hypothèses en isolation
//!    (Basic / Planned / Self-Correcting), compare les preuves, et promeut le
//!    meilleur monde — ou escalade si aucun ne franchit la barrière.

use genos_orchestrator::genos_cell::{AgentCell, Pathology};
use genos_orchestrator::{GenosEcosystem, Goal, Multiverse};

fn main() {
    println!("=== MISSION : observation + mondes paralleles (Trinity) ===\n");

    // --- 1. Monde réel observé ---
    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Perimeter", "Defense").unwrap();
    for i in 0..3 {
        eco.orchestrator
            .add_worker("Perimeter", AgentCell::new(format!("Agent_{i}"), "a", "Guard"))
            .unwrap();
    }
    let mut sick = AgentCell::new("Patient", "p", "Guard");
    sick.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 14.0 });
    eco.orchestrator.add_worker("Perimeter", sick).unwrap();
    eco.virology.synthesize_bacteriophage("SPIKE", "KILL");
    eco.record_event("INTEL", serde_json::json!({ "threat": "spike" }));

    let observed = eco.observe();
    println!("[1] Observation live :");
    println!(
        "    tissus={} agents={} menace={:.1} malades={} incertain={} budget={:.0}",
        observed.tissues,
        observed.workers,
        observed.threat,
        observed.diseased,
        observed.uncertain,
        observed.budget
    );

    // --- 2. Trois mondes isolés ---
    let goal = Goal::SecurePerimeter;
    let result = Multiverse::trinity(&goal, &observed);

    println!("\n[2] Mondes paralleles (Trinity) :");
    for world in &result.worlds {
        println!(
            "    monde {:<14} organisation={:<22} superorganisme={:<13} etapes={:<2} progression={:.2} atteint={}",
            world.hypothesis.name(),
            world.organization,
            world.superorganism.name(),
            world.steps.len(),
            world.progress,
            world.reached
        );
    }

    println!("\n[3] Barriere de preuve : {}", result.reason);
    match result.winner() {
        Some(winner) => println!(
            "    MONDE PROMU : {} -> {:?}",
            winner.hypothesis.name(),
            winner.steps
        ),
        None => println!("    Aucun monde promu : escalade vers l'humain."),
    }
    println!(
        "    Fusion des concepts testes : {:?}",
        result.merged_steps()
    );

    assert!(result.winner().is_some(), "un monde doit etre promu");
    assert_eq!(result.worlds.len(), 3);
    println!("\nMISSION OBSERVATION + TRINITY VALIDEE");
}
