//! MISSION : boucle cognitive complète (`tick`) sur plusieurs cycles.
//!
//! À chaque tick : observe (état réel) → decide (concepts) → exécute
//! (replay/diagnostic, recrutement, soin, plasmide…) → apprend. La provenance
//! des agents est persistée puis rechargée.

use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, Goal, Outcome};

fn main() {
    println!("=== MISSION : boucle cognitive (observe -> decide -> agit -> apprend) ===\n");

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

    let goal = Goal::SecurePerimeter;
    for round in 1..=6 {
        let report = eco.tick(&goal);
        println!(
            "tick {round}: strategie={:?} org={} super={}",
            report.strategy, report.organization, report.superorganism
        );
        println!("  plan     : {:?}", report.planned);
        println!("  execute  : {:?}", report.executed);
        if !report.verdicts.is_empty() {
            println!("  verdicts : {} agents diagnostiques", report.verdicts.len());
        }
        if let Some(reason) = report.halt {
            println!("  ARRET    : {reason}");
            break;
        }
    }

    // Provenance persistée puis rechargée.
    let path = std::env::temp_dir().join(format!("genos-prov-{}", std::process::id()));
    eco.save_traces(&path).unwrap();
    let mut restored = GenosEcosystem::new("Restored");
    restored.load_traces(&path).unwrap();
    println!(
        "\nProvenance persistee : {} agents, {} = {} evenements",
        restored.traces.known(),
        &loop_agent.to_string()[..8],
        restored.trace_provenance(loop_agent).len()
    );
    let _ = std::fs::remove_file(&path);

    println!("\nMISSION BOUCLE COGNITIVE VALIDEE");
}
