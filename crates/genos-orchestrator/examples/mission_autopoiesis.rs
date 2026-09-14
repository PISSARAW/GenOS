//! MISSION autopoïèse (Phase 6) : frontière auto-entretenue, self-model,
//! auto-réparation, et mort quand la membrane est rompue.

use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, Goal};

fn main() {
    println!("=== MISSION AUTOPOIESE : frontiere, self-model, auto-reparation ===\n");

    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("ouvrier", "o", "Worker"))
        .unwrap();

    // Dégradation réelle de la frontière.
    eco.orchestrator.membrane.degrade_per_sec = 1.0;
    eco.orchestrator.membrane.integrity = 1.0;
    std::thread::sleep(std::time::Duration::from_millis(150));

    let before = eco.self_model();
    println!(
        "[SELF] identite={} composants={} tissus={} adn={} integrite={:.3} atp={:.1} vivant={}",
        before.identity,
        before.components,
        before.tissues,
        before.dna_registered,
        before.integrity,
        before.atp,
        before.alive
    );

    // Auto-réparation (membrane + ADN manquants), sans intervention externe.
    let repair = eco.self_repair();
    println!(
        "[REPAIR] actions={:?} integrite {:.3} -> {:.3} | atp {:.1} -> {:.1}",
        repair.actions,
        repair.integrity_before,
        repair.integrity_after,
        repair.atp_before,
        repair.atp_after
    );

    let after = eco.self_model();
    println!(
        "[SELF] integrite={:.3} adn={} reparations={}",
        after.integrity, after.dna_registered, after.repairs
    );
    assert!(after.integrity > before.integrity);
    assert!(after.dna_registered >= before.dna_registered);

    // Mort : frontière rompue.
    eco.orchestrator.membrane.integrity = 0.0;
    println!("\n[MORT] vivant={}", eco.is_alive());
    let dead = eco.tick(&Goal::SecurePerimeter);
    println!("[TICK] arret={:?}", dead.halt);
    assert!(!eco.is_alive());
    assert!(dead.halt.as_deref().unwrap().contains("mort"));

    println!("\nMISSION AUTOPOIESE VALIDEE");
}
