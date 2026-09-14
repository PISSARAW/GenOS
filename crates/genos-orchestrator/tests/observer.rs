use genos_orchestrator::genos_cell::{AgentCell, Pathology};
use genos_orchestrator::GenosEcosystem;

#[test]
fn observe_reflete_l_ecosysteme_vivant() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("A", "role").unwrap();

    eco.orchestrator
        .add_worker("A", AgentCell::new("sain", "h", "Worker"))
        .unwrap();
    let mut sick = AgentCell::new("malade", "s", "Worker");
    sick.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 12.0 });
    eco.orchestrator.add_worker("A", sick).unwrap();

    // Un virion actif dans le laboratoire virologique.
    eco.virology.synthesize_bacteriophage("SPIKE", "KILL");

    let state = eco.observe();
    assert_eq!(state.tissues, 1);
    assert_eq!(state.workers, 2);
    assert!(state.threat > 0.0, "virion actif => menace observee");
    assert!(state.diseased >= 1, "cellule malade detectee");
    assert!(state.uncertain, "aucune preuve journalisee => incertitude");

    // L'observation suit l'état : virion neutralisé => menace nulle.
    eco.virology.virions[0].is_neutralized = true;
    assert!(eco.observe().threat <= 0.0);

    // Une preuve journalisée lève l'incertitude.
    eco.record_event("INTEL", serde_json::json!({ "source": "test" }));
    assert!(!eco.observe().uncertain);
}
