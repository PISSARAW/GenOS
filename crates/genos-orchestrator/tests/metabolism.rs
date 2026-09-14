use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{Action, Environment, FileSandbox, GenosEcosystem, Goal};

fn tmp(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("genos-meta-{}-{}", name, std::process::id()))
}

#[test]
fn famine_bloque_les_actions_et_le_feed_les_restaure() {
    let dir = tmp("famine");
    let mut env = FileSandbox::new(&dir).unwrap();
    env.act(Action::Write {
        path: "spec.txt".to_string(),
        content: "ok\n".to_string(),
    });

    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.metabolism.atp = 0.0;
    assert!(eco.observe().budget <= 0.0, "budget observe = ATP");

    let starved = eco.embodied_task(&mut env, "spec.txt", "out.txt", 2);
    assert!(!starved.success);
    assert!(starved.reason.contains("famine"), "reason={}", starved.reason);

    eco.feed(100.0);
    assert!(eco.atp() > 0.0);
    let fed = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);
    assert!(fed.success, "reason={}", fed.reason);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn le_metabolisme_se_recharge_dans_le_temps_reel() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.metabolism.atp = 0.0;
    std::thread::sleep(std::time::Duration::from_millis(60));
    assert!(eco.atp() > 0.0, "regeneration temporelle reelle");
}

#[test]
fn la_famine_arrete_le_tick() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("w", "w", "W"))
        .unwrap();
    eco.orchestrator.metabolism.atp = 0.0;

    let report = eco.tick(&Goal::SecurePerimeter);
    assert!(
        report
            .halt
            .as_deref()
            .map(|r| r.contains("budget"))
            .unwrap_or(false),
        "halt={:?}",
        report.halt
    );
}
