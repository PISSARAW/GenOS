//! MISSION incarnée (Phase 1) : l'orchestrateur perçoit un environnement réel
//! (bac à sable fichiers), agit dessus, et reçoit une **récompense externe**.
//!
//! Tâche : rendre `out.txt` identique à `spec.txt`, en boucle fermée.

use genos_orchestrator::{Action, Environment, FileSandbox, GenosEcosystem};

fn main() {
    println!("=== MISSION INCARNEE : boucle perception -> action -> recompense ===\n");

    let dir = std::env::temp_dir().join(format!("genos-embodied-{}", std::process::id()));
    let mut env = FileSandbox::new(&dir).expect("sandbox");

    // L'environnement contient la spécification.
    let spec = "somme(1..=10) = 55\n";
    let fb = env.act(Action::Write {
        path: "spec.txt".to_string(),
        content: spec.to_string(),
    });
    assert!(fb.success);
    println!("[ENV] spec.txt ecrite ({} octets)", spec.len());

    // L'orchestrateur doit produire la sortie conforme.
    let mut eco = GenosEcosystem::new("Griot_Prime");
    let report = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);

    println!(
        "[EMBODIED] iterations={} succes={} raison={}",
        report.iterations, report.success, report.reason
    );
    println!("           actions={}", report.actions.len());
    println!("           recompenses={:?}", report.rewards);
    println!(
        "[MONDE] out.txt = {:?}",
        env.sense("out.txt").content.trim()
    );

    assert!(report.success);
    assert_eq!(env.sense("out.txt").content, spec);
    assert!(!report.actions.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
    println!("\nMISSION INCARNEE VALIDEE");
}
