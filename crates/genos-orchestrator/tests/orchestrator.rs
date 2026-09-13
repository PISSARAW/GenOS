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

#[test]
fn test_cleave_does_not_register_unlinked_cells() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    let before = orchestrator.active_cells.len();
    let swarm = orchestrator.cleave_and_differentiate(2, 1.0);
    assert!(!swarm.is_empty());
    assert_eq!(
        orchestrator.active_cells.len(),
        before,
        "aucune cellule non liee a un tissu ne doit etre enregistree"
    );
}

#[test]
fn test_sporulation_preserves_genome_lineage() {
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    orchestrator.create_tissue("Core", "Role").unwrap();
    let cell = orchestrator
        .cleave_and_differentiate(1, 1.0)
        .into_iter()
        .next()
        .unwrap();
    let genome_id = cell.genome_id.expect("cellule differenciee sans genome");
    assert!(orchestrator.genomes.contains_key(&genome_id), "genome non enregistre");
    let cell_id = orchestrator.add_worker("Core", cell).unwrap();

    let spore_idx = orchestrator
        .sporulate_cell(cell_id, SporeType::BacterialEndospore)
        .unwrap();
    assert_eq!(
        orchestrator.dormant_spores[spore_idx].genome.genome_id(),
        genome_id,
        "la spore doit conserver la lignee"
    );

    let revived = orchestrator.germinate_spore(spore_idx, (true, true)).unwrap();
    assert_eq!(
        revived.genome_id,
        Some(genome_id),
        "la cellule ranimee doit garder son genome"
    );
}

#[test]
fn test_invariants_hold_across_lifecycle() {
    let mut orch = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    orch.create_tissue("A", "r").unwrap();
    orch.create_tissue("B", "r").unwrap();
    let w1 = orch.add_worker("A", AgentCell::new("w1", "w", "Worker")).unwrap();
    let w2 = orch.add_worker("B", AgentCell::new("w2", "w", "Worker")).unwrap();
    orch.delegate_task("A", (w1, "t")).unwrap();
    orch.check_invariants().unwrap();

    let idx = orch.sporulate_cell(w1, SporeType::BacterialEndospore).unwrap();
    orch.check_invariants().unwrap();
    orch.germinate_spore(idx, (true, true)).unwrap();
    orch.check_invariants().unwrap();

    orch.trigger_endosymbiosis(w2, w1).unwrap();
    orch.check_invariants().unwrap();
}

#[test]
fn test_invariants_under_random_operations() {
    let mut orch = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    for t in ["A", "B", "C"] {
        orch.create_tissue(t, "r").unwrap();
    }
    let mut seed = 0x1234_5678_9abc_def0_u64;
    let mut next = move || {
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (seed >> 33) as usize
    };
    let mut workers = Vec::new();
    for i in 0..30 {
        let tissue = ["A", "B", "C"][next() % 3];
        workers.push(
            orch.add_worker(tissue, AgentCell::new(format!("c{i}"), "c", "Worker"))
                .unwrap(),
        );
        orch.check_invariants().unwrap();
    }
    for _ in 0..40 {
        let id = workers[next() % workers.len()];
        if !orch.active_cells.contains_key(&id) {
            continue;
        }
        match next() % 3 {
            0 => {
                let _ = orch.sporulate_cell(id, SporeType::BacterialEndospore);
            }
            1 => {
                let n = orch.dormant_spores.len();
                if n > 0 {
                    let _ = orch.germinate_spore(next() % n, (true, true));
                }
            }
            _ => {
                let other = workers[next() % workers.len()];
                let _ = orch.trigger_endosymbiosis(id, other);
            }
        }
        orch.check_invariants().unwrap();
    }
}


