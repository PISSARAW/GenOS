use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{Concept, GenosEcosystem, Goal, Outcome, Verdict};

#[test]
fn tick_boucle_observe_decide_agit_et_persiste() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let loop_agent = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("loop", "l", "W"))
        .unwrap();
    let waste = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("waste", "w", "W"))
        .unwrap();
    let bad = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("bad", "b", "W"))
        .unwrap();

    for _ in 0..3 {
        eco.record_action(loop_agent, "retry", Outcome::Success);
    }
    for _ in 0..3 {
        eco.record_action(waste, "spam", Outcome::Wasted);
    }
    for _ in 0..3 {
        eco.record_action(bad, "crash", Outcome::Failure);
    }

    // ADN pour mutation/croisement.
    let genome = genos_orchestrator::genos_genome::Genome::new("BASE");
    let dna = genos_orchestrator::dna_ops::from_genome(&genome, "seed");
    eco.register_dna(loop_agent, dna.clone());
    eco.register_dna(bad, dna);

    let goal = Goal::SecurePerimeter;
    let first = eco.tick(&goal);
    assert!(
        first.executed.contains(&Concept::Replay),
        "le premier tick doit diagnostiquer (Replay)"
    );

    // Boucle jusqu'à atteinte du but (ou arrêt).
    for _ in 0..4 {
        let report = eco.tick(&goal);
        if report.halt.is_some() {
            break;
        }
    }

    // Persistance de la provenance.
    let path = std::env::temp_dir().join(format!("genos-traces-{}", std::process::id()));
    eco.save_traces(&path).unwrap();
    let mut other = GenosEcosystem::new("Other");
    other.load_traces(&path).unwrap();
    assert_eq!(other.traces.known(), eco.traces.known());
    assert_eq!(other.diagnose_agent(loop_agent), Verdict::NeedsMutation);
    assert!(!eco.trace_provenance(loop_agent).is_empty());
    let _ = std::fs::remove_file(&path);
}

#[test]
fn run_itert_jusqu_a_arret_avec_rapport_global() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("a", "a", "W"))
        .unwrap();
    // Une preuve journalisée lève l'incertitude (sinon escalade humaine).
    eco.record_event("INTEL", serde_json::json!({ "ok": true }));

    let report = eco.run(&Goal::SecurePerimeter, 6);
    assert!(report.halted, "run doit s'arreter");
    assert!(report.reached, "le but doit etre atteint");
    assert!(report.ticks >= 1);
    assert_eq!(report.traces, eco.traces.known());
    assert!(
        report.executed.contains(&Concept::Recruit),
        "des agents doivent etre recrutes"
    );
    assert!(report.agents_after > report.agents_before);
}

