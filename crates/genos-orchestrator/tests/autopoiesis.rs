use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, Goal};

#[test]
fn la_membrane_se_degrade_dans_le_temps() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.membrane.integrity = 0.5;
    eco.orchestrator.membrane.degrade_per_sec = 1.0;
    std::thread::sleep(std::time::Duration::from_millis(60));
    assert!(
        eco.self_model().integrity < 0.5,
        "la frontiere doit se degrader avec le temps reel"
    );
}

#[test]
fn l_auto_reparation_regenere_la_membrane_et_l_adn() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let id = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("worker", "w", "W"))
        .unwrap();
    assert!(!eco.agent_dna.contains_key(&id), "ADN absent au depart");

    eco.orchestrator.membrane.integrity = 0.5;
    let report = eco.self_repair();

    assert!(report.integrity_after > report.integrity_before, "membrane regeneree");
    assert!(report.atp_after < report.atp_before, "reparation coute de l'ATP");
    assert!(report.actions.iter().any(|a| a.contains("membrane")));
    assert!(report.actions.iter().any(|a| a.contains("adn_restaure")));
    assert!(eco.agent_dna.contains_key(&id), "ADN restaure");
}

#[test]
fn membrane_rompue_egale_mort() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.membrane.integrity = 0.0;
    assert!(!eco.is_alive());

    let report = eco.tick(&Goal::SecurePerimeter);
    assert!(
        report.halt.as_deref().map(|r| r.contains("mort")).unwrap_or(false),
        "halt={:?}",
        report.halt
    );
}
