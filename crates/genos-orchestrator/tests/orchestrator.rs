use genos_biology::spore::SporeType;
use genos_cell::{AgentCell, Organelle};
use genos_orchestrator::BiomimeticOrchestrator;

#[test]
fn test_endosymbiosis() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    let host = AgentCell::new("Host", "The Absorber", "Architect");
    let symbiont = AgentCell::new("Symbiont", "The Absorbed", "Verifier");

    let host_id = host.cell_id;
    let symbiont_id = symbiont.cell_id;

    orchestrator.active_cells.insert(host_id, host);
    orchestrator.active_cells.insert(symbiont_id, symbiont);

    assert!(orchestrator.active_cells.contains_key(&symbiont_id));

    let result = orchestrator.trigger_endosymbiosis(host_id, symbiont_id);
    assert!(result.is_ok());

    // Symbiont should no longer be an active autonomous cell
    assert!(!orchestrator.active_cells.contains_key(&symbiont_id));

    // Host should contain the symbiont as an organelle
    let host_cell = orchestrator.active_cells.get(&host_id).unwrap();
    assert_eq!(host_cell.organelles.len(), 1);

    match &host_cell.organelles[0] {
        Organelle::Endosymbiont { original_id, role, .. } => {
            assert_eq!(*original_id, symbiont_id);
            assert_eq!(role, "Verifier");
        }
        _ => panic!("expected an endosymbiont organelle"),
    }
}

#[test]
fn test_add_worker_does_not_orphan_cell_on_unknown_tissue() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    let worker = AgentCell::new("Worker", "Worker", "Worker");
    let worker_id = worker.cell_id;
    assert!(orchestrator.add_worker("missing", worker).is_err());
    assert!(!orchestrator.active_cells.contains_key(&worker_id));
}

#[test]
fn test_failed_germination_preserves_dormant_spore() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    orchestrator.create_tissue("Core", "Role").unwrap();
    let worker_id = orchestrator
        .add_worker("Core", AgentCell::new("Worker", "Worker", "Worker"))
        .unwrap();
    let spore_idx = orchestrator
        .sporulate_cell(worker_id, SporeType::BacterialEndospore)
        .unwrap();

    // Environnement hostile : la germination doit échouer sans perdre la spore.
    assert!(orchestrator.germinate_spore(spore_idx, (true, false)).is_err());
    assert_eq!(orchestrator.dormant_spores.len(), 1, "la spore doit rester dormante");
}

#[test]
fn test_sporulation_detaches_cell_from_tissue() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    orchestrator.create_tissue("Core", "Role").unwrap();
    let worker_id = orchestrator
        .add_worker("Core", AgentCell::new("Worker", "Worker", "Worker"))
        .unwrap();
    orchestrator
        .sporulate_cell(worker_id, SporeType::BacterialEndospore)
        .unwrap();

    assert!(!orchestrator.active_cells.contains_key(&worker_id));
    assert!(
        orchestrator.delegate_task("Core", (worker_id, "continuer")).is_err(),
        "une cellule sporulee ne doit plus etre délégable"
    );
}

#[test]
fn test_germinated_cell_rejoins_its_tissue() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    orchestrator.create_tissue("Core", "Role").unwrap();
    let worker_id = orchestrator
        .add_worker("Core", AgentCell::new("Worker", "Worker", "Worker"))
        .unwrap();

    let spore_idx = orchestrator
        .sporulate_cell(worker_id, SporeType::BacterialEndospore)
        .unwrap();
    assert!(orchestrator.delegate_task("Core", (worker_id, "x")).is_err());

    let revived = orchestrator.germinate_spore(spore_idx, (true, true)).unwrap();
    assert_eq!(revived.cell_id, worker_id);
    assert!(
        orchestrator.delegate_task("Core", (worker_id, "x")).is_ok(),
        "la cellule germee doit reintegrer son tissu d'origine"
    );
}

#[test]
fn test_endosymbiosis_detaches_symbiont_from_tissue() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    orchestrator.create_tissue("Core", "Role").unwrap();
    let host_id = orchestrator
        .add_worker("Core", AgentCell::new("Host", "Hote", "Host"))
        .unwrap();
    let symbiont_id = orchestrator
        .add_worker("Core", AgentCell::new("Sym", "Symbionte", "Symbiont"))
        .unwrap();

    orchestrator.trigger_endosymbiosis(host_id, symbiont_id).unwrap();

    assert!(!orchestrator.active_cells.contains_key(&symbiont_id));
    assert!(
        orchestrator.delegate_task("Core", (symbiont_id, "encore la ?")).is_err(),
        "un symbionte phagocyte ne doit plus etre délégable"
    );
}

#[test]
fn test_failed_endosymbiosis_is_atomic() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    let host = AgentCell::new("Host", "Hote", "Host");
    let host_id = host.cell_id;
    orchestrator.active_cells.insert(host_id, host);

    let phantom = AgentCell::new("Phantom", "Absent", "Worker");
    let missing_symbiont = phantom.cell_id;
    assert!(orchestrator.trigger_endosymbiosis(host_id, missing_symbiont).is_err());
    assert!(orchestrator.trigger_endosymbiosis(host_id, host_id).is_err());

    assert!(
        orchestrator.active_cells.contains_key(&host_id),
        "un echec d'endosymbiose ne doit jamais retirer l'hote"
    );
    assert!(!orchestrator.active_cells.contains_key(&missing_symbiont));
}
