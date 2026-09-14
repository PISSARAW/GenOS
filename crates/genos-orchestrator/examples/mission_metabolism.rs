//! MISSION métabolique (Phase 3) : l'ATP est une ressource réelle.
//!
//! À court d'énergie, l'organisme ne peut plus agir sur le monde (famine) ; il
//! se régénère avec le temps réel et peut être nourri (`feed`).

use genos_orchestrator::{Action, Environment, FileSandbox, GenosEcosystem};

fn main() {
    println!("=== MISSION METABOLIQUE : famine, regeneration, nourriture ===\n");

    let dir = std::env::temp_dir().join(format!("genos-metabolism-{}", std::process::id()));
    let mut env = FileSandbox::new(&dir).expect("sandbox");
    env.act(Action::Write {
        path: "spec.txt".to_string(),
        content: "energie = atp\n".to_string(),
    });

    let mut eco = GenosEcosystem::new("Griot_Prime");
    println!("[ATP] initial = {:.1} / {:.1}", eco.atp(), eco.orchestrator.metabolism.capacity);

    // Épuisement.
    eco.orchestrator.metabolism.atp = 0.0;
    println!("[FAMINE] ATP = {:.1}", eco.atp());
    let starved = eco.embodied_task(&mut env, "spec.txt", "out.txt", 2);
    println!("[ACTION] succes={} raison={}", starved.success, starved.reason);
    assert!(!starved.success);

    // Régénération temporelle réelle.
    std::thread::sleep(std::time::Duration::from_millis(120));
    let regenerated = eco.atp();
    println!("[REGEN] ATP apres 120 ms = {regenerated:.2} (regeneration temporelle)");

    // Nourriture.
    eco.feed(100.0);
    println!("[REPAS] ATP = {:.1}", eco.atp());
    let fed = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);
    println!("[ACTION] succes={} raison={}", fed.success, fed.reason);

    println!(
        "[BILAN] consomme={:.2} produit={:.2}",
        eco.orchestrator.metabolism.consumed_total, eco.orchestrator.metabolism.produced_total
    );

    assert!(fed.success);
    let _ = std::fs::remove_dir_all(&dir);
    println!("\nMISSION METABOLIQUE VALIDEE");
}
