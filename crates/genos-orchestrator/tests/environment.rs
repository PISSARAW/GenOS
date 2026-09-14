use genos_orchestrator::{Action, Environment, FileSandbox, GenosEcosystem};

fn tmp_dir(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("genos-env-{}-{}", name, std::process::id()))
}

#[test]
fn sandbox_interdit_la_remontee() {
    let dir = tmp_dir("sandbox");
    let mut env = FileSandbox::new(&dir).unwrap();
    let feedback = env.act(Action::Write {
        path: "../evil.txt".to_string(),
        content: "x".to_string(),
    });
    assert!(!feedback.success, "remontee interdite");
    let escaped = dir.parent().unwrap().join("evil.txt");
    assert!(!escaped.exists(), "aucune ecriture hors racine");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn boucle_incarnee_rend_la_sortie_conforme() {
    let dir = tmp_dir("loop");
    {
        let mut env = FileSandbox::new(&dir).unwrap();
        let fb = env.act(Action::Write {
            path: "spec.txt".to_string(),
            content: "42\n".to_string(),
        });
        assert!(fb.success);
    }

    let mut env = FileSandbox::new(&dir).unwrap();
    let mut eco = GenosEcosystem::new("Overmind");
    let report = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);
    assert!(report.success, "reason={}", report.reason);
    assert!(report
        .actions
        .iter()
        .any(|a| matches!(a, Action::Write { .. })));
    assert_eq!(env.sense("out.txt").content, "42\n");
    assert!(eco.events.count() >= 1, "action journalisee");

    // Idempotence : déjà conforme -> aucune nouvelle action.
    let again = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);
    assert!(again.success);
    assert!(again.actions.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn spec_absente_echoue() {
    let dir = tmp_dir("nospec");
    let mut env = FileSandbox::new(&dir).unwrap();
    let mut eco = GenosEcosystem::new("Overmind");
    let report = eco.embodied_task(&mut env, "absent.txt", "out.txt", 2);
    assert!(!report.success);
    assert!(report.reason.contains("introuvable"));
    let _ = std::fs::remove_dir_all(&dir);
}
