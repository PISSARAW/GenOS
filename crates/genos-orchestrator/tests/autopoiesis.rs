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

#[test]
fn la_membrane_totale_repare_la_coherence_semantique() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.membrane.semantic_integrity = 0.3;

    let report = eco.self_repair();

    assert!(report.integrity_before < 1.0);
    assert!(report.integrity_after > report.integrity_before);
    assert!(eco.orchestrator.membrane.semantic_integrity > 0.3);
    assert!(eco.is_alive());
}

#[test]
fn le_tick_recupere_un_genome_perdu() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let id = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("worker", "w", "W"))
        .unwrap();
    let genome = genos_orchestrator::genos_genome::Genome::new("LOST");
    let genome_id = genome.genome_id();
    eco.orchestrator.genomes.insert(genome_id, genome);
    eco.orchestrator.active_cells.get_mut(&id).unwrap().genome_id = Some(genome_id);
    eco.orchestrator.genomes.clear();

    let _ = eco.tick(&Goal::Conserve);

    let restored_id = eco.orchestrator.active_cells.get(&id).unwrap().genome_id;
    assert!(restored_id.is_some());
    assert!(eco.orchestrator.genomes.contains_key(&restored_id.unwrap()));
}
