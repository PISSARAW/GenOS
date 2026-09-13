use genos_orchestrator::genos_biology::therapy::SystemicTherapy;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_common::traits::{MemoryEntry, SearchQuery};
use genos_orchestrator::genos_dna::model::{AgentDna, Provenance};
use genos_orchestrator::genos_genome::Genome;
use genos_orchestrator::GenosEcosystem;
use std::collections::HashMap;

#[test]
fn ecosystem_gives_access_to_every_subsystem() {
    let mut eco = GenosEcosystem::new("Overmind");

    // Orchestrateur : tissus / délégation
    eco.orchestrator.create_tissue("Core", "Role").unwrap();
    let worker = eco
        .orchestrator
        .add_worker("Core", AgentCell::new("Kwame", "k", "Worker"))
        .unwrap();
    assert!(eco.orchestrator.delegate_task("Core", (worker, "tache")).is_ok());

    // Signalisation : stigmergie + Kuramoto + quorum
    eco.deposit_trail("OPTIMAL_PATH", 5.0);
    assert_eq!(eco.read_trail("OPTIMAL_PATH"), 5.0);
    eco.add_oscillator("a", 0.0, 1.0);
    eco.add_oscillator("b", 0.5, 1.1);
    eco.couple_oscillators(0.5, 0.01);
    eco.quorum_step(0.1);

    // Stockage : événements, capsules, cryptobiose, fossiles, mémoire
    let event_id = eco.record_event("CELL_BORN", serde_json::json!({ "name": "Kwame" }));
    assert!(!event_id.is_nil());
    let capsule_id = eco.seal_capsule("boundary_1", serde_json::json!({ "state": "ok" }));
    assert!(!capsule_id.is_nil());
    eco.freeze_agent("agent-x", serde_json::json!({ "memory": 1 }));
    eco.fossilize("lineage-1", "extinction");
    assert_eq!(eco.events.count(), 1);

    let entry = MemoryEntry {
        id: "mem-1".into(),
        content: "chromatine".into(),
        embedding: Some(vec![1.0, 0.0]),
        tags: HashMap::new(),
    };
    eco.remember(entry).unwrap();
    let found = eco
        .recall(SearchQuery { text: None, vector: Some(vec![1.0, 0.0]), limit: 1 })
        .unwrap();
    assert_eq!(found.len(), 1);

    // Reproduction : mitose, méiose, croisement
    let genome = Genome::new("BASE");
    assert_eq!(eco.mitosis(&genome).unwrap().len(), 2);
    assert!(!eco.meiosis(&genome, Some(2)).unwrap().is_empty());
    let (_child_a, _child_b) = eco.crossover(&genome, &Genome::new("BASE2"), 3);

    // Biologie appliquée : thérapie systémique
    let mut patient = AgentCell::new("Patient", "p", "Worker");
    let outcome = eco.apply_therapy(&mut patient, &SystemicTherapy::IntensiveCareFluids);
    assert!(!outcome.therapy_name.is_empty());

    // ADN compilé : encodage + expression phénotypique
    let dna = AgentDna::from_genome(&genome, "Kwame", Provenance::default());
    assert!(!eco.encode_dna(&dna).unwrap().is_empty());
    let _phenotype = eco.express_dna(&dna);
}

#[test]
fn ecosystem_reexports_non_runtime_crates() {
    // Accès (sans exécution GUI) au crate sensorimoteur via le ré-export.
    let _capture: fn() -> Result<(String, u32, u32), String> =
        genos_orchestrator::genos_sensorimotor::capture_screen_base64;
    let _step = genos_orchestrator::genos_sensorimotor::ActionStep {
        action: "click".into(),
        x: Some(1),
        y: Some(2),
        text: None,
        button: Some("left".into()),
    };

    // Accès direct aux concepts de signalisation.
    let mut field = genos_orchestrator::genos_signal::StigmergyField::new(0.1);
    field.deposit("x", 1.0);
    assert_eq!(field.read("x"), 1.0);
}
