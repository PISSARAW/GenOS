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

    let max_generation = eco
        .orchestrator
        .genomes
        .values()
        .map(|genome| genome.generation)
        .max()
        .unwrap_or_default();
    assert!(max_generation >= 3, "la fille doit reprendre la boucle genetique");
    let lineage_ids: std::collections::HashSet<_> = eco
        .orchestrator
        .genomes
        .values()
        .map(|genome| genome.lineage_id())
        .collect();
    assert_eq!(lineage_ids.len(), 1, "la boucle doit rester dans une seule lignee");
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

#[test]
fn le_tick_repare_automatiquement_une_membrane_vivante() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.membrane.integrity = 0.4;
    eco.orchestrator.metabolism.atp = 10.0;

    let _ = eco.tick(&Goal::Conserve);

    assert!(eco.orchestrator.membrane.integrity > 0.4);
    assert_eq!(eco.orchestrator.membrane.repairs, 1);
}

#[test]
fn le_tick_ne_ressuscite_pas_une_membrane_romptue() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.membrane.integrity = 0.0;
    eco.orchestrator.metabolism.atp = 100.0;

    let report = eco.tick(&Goal::Conserve);

    assert_eq!(
        report.halt.as_deref(),
        Some("organisme mort: membrane rompue")
    );
    assert_eq!(eco.orchestrator.membrane.repairs, 0);
}
