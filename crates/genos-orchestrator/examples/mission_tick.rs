//! MISSION : boucle cognitive complète (`tick`/`run`).
//!
//! Le directeur observe l'état réel, choisit ses concepts, les exécute
//! (replay/diagnostic, recrutement, soin, plasmide, muter/croiser…) et
//! apprend. `run` itère jusqu'à l'arrêt et produit un rapport global. La
//! provenance des agents est persistée puis rechargée.

use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, Goal, Outcome};

fn main() {
    println!("=== MISSION : boucle cognitive (run) ===\n");

    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let loop_agent = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Boucleur", "l", "Worker"))
        .unwrap();
    let waste = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Gaspilleur", "w", "Worker"))
        .unwrap();
    let bad = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Casse", "b", "Worker"))
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
    let genome = genos_orchestrator::genos_genome::Genome::new("BASE");
    let dna = genos_orchestrator::dna_ops::from_genome(&genome, "seed");
    for id in [loop_agent, waste, bad] {
        eco.register_dna(id, dna.clone());
    }
    eco.record_event("INTEL", serde_json::json!({ "threat": "none" }));

    // Boucle complète jusqu'à l'arrêt.
    let report = eco.run(&Goal::SecurePerimeter, 6);
    println!("[RUN] ticks={} halted={} atteint={}", report.ticks, report.halted, report.reached);
    println!("      arret   : {:?}", report.halt_reason);
    println!("      concepts executes : {:?}", report.executed);
    println!(
        "      agents {} -> {} | verdicts={} | traces={}",
        report.agents_before, report.agents_after, report.verdicts, report.traces
    );

    // Provenance persistée puis rechargée.
    let path = std::env::temp_dir().join(format!("genos-prov-{}", std::process::id()));
    eco.save_traces(&path).unwrap();
    let mut restored = GenosEcosystem::new("Restored");
    restored.load_traces(&path).unwrap();
    println!(
        "\n[PROVENANCE] {} agents restaures, Boucleur = {} evenements",
        restored.traces.known(),
        restored.trace_provenance(loop_agent).len()
    );
    let _ = std::fs::remove_file(&path);

    assert!(report.halted && report.reached);
    assert!(report.executed.iter().any(|c| format!("{c:?}") == "Replay"));
    println!("\nMISSION BOUCLE COGNITIVE VALIDEE");
}
