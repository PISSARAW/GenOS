use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::reproduction_cycle::ReproductionBlocked;
use genos_orchestrator::{GenosEcosystem, Goal};

#[test]
fn lignee_cellulaire_continue_sur_plusieurs_generations_sans_operateur() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let founder = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Fondatrice", "w", "Soma"))
        .unwrap();
    eco.seed_germline(founder, "FOUNDER_GENOME").unwrap();
    eco.feed(500.0);

    let before = eco.orchestrator.active_cells.len();
    // Aucune commande de reproduction n'est jamais émise ici : seul `tick`
    // (boucle cognitive ordinaire) est appelé, comme le ferait un but non lié
    // à la reproduction.
    for _ in 0..10 {
        let _ = eco.tick(&Goal::Conserve);
    }
    let after = eco.orchestrator.active_cells.len();
    assert!(after > before, "au moins une division autonome attendue");

    let has_next_generation = eco.orchestrator.genomes.values().any(|g| g.generation >= 1);
    assert!(has_next_generation, "la lignee doit avoir progresse d'au moins une generation");
}

#[test]
fn reproduction_bloquee_si_atp_insuffisant() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let founder = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Fondatrice", "w", "Soma"))
        .unwrap();
    eco.seed_germline(founder, "FOUNDER_GENOME").unwrap();
    eco.orchestrator.metabolism.atp = 0.0;

    let outcome = eco.autonomous_reproduction_cycle();
    assert_eq!(outcome, Err(ReproductionBlocked::InsufficientAtp));
}

#[test]
fn reproduction_bloquee_si_membrane_trop_faible() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let founder = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Fondatrice", "w", "Soma"))
        .unwrap();
    eco.seed_germline(founder, "FOUNDER_GENOME").unwrap();
    eco.orchestrator.membrane.integrity = 0.1;

    let outcome = eco.autonomous_reproduction_cycle();
    assert_eq!(outcome, Err(ReproductionBlocked::MembraneTooWeak));
}

#[test]
fn sans_lignee_amorcee_aucune_reproduction_ne_se_produit() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("w", "w", "W"))
        .unwrap();

    let outcome = eco.autonomous_reproduction_cycle();
    assert_eq!(outcome, Err(ReproductionBlocked::NoEligibleMother));
}
