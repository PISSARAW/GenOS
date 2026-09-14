use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, OrganismConfig};

#[test]
fn organisme_percoit_decide_et_reste_vivant() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("w", "w", "W"))
        .unwrap();

    let report = eco.organism_tick(&OrganismConfig::default());
    assert!(report.alive);
    assert!(!report.goal.is_empty());
    assert!(report.strategy.is_some());
    assert!(report.atp <= 100.0);
}

#[test]
fn organisme_se_repare_et_se_nourrit() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("w", "w", "W"))
        .unwrap();
    eco.orchestrator.membrane.integrity = 0.5;
    eco.orchestrator.metabolism.atp = 5.0;

    let report = eco.organism_tick(&OrganismConfig::default());
    assert!(!report.repairs.is_empty(), "reparation attendue");
    assert!(report.fed, "nourriture attendue (ATP bas)");
    assert!(report.integrity > 0.5, "frontiere regeneree");
    assert!(report.atp > 5.0, "energie reconstituee");
}

#[test]
fn organisme_meurt_si_membrane_rompue() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.membrane.integrity = 0.0;
    let report = eco.organism_tick(&OrganismConfig::default());
    assert!(!report.alive);
    assert!(report.halt.as_deref().unwrap().contains("mort"));
}

#[test]
fn run_organism_survit_plusieurs_cycles() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("w", "w", "W"))
        .unwrap();

    let reports = eco.run_organism(&OrganismConfig::default(), 4);
    assert!(!reports.is_empty());
    assert!(reports.iter().all(|r| r.alive), "l'organisme survit");
}
