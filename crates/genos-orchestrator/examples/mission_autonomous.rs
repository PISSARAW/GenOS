//! MISSION autonome (Phase 2) : aucun but externe.
//!
//! Les **drives** (énergie, intégrité, curiosité) sont dérivés du monde et le
//! `GoalSelector` choisit le but à chaque tick — l'orchestrateur décide *quoi*
//! poursuivre comme un organisme réduisant ses déficits.

use genos_orchestrator::genos_cell::{AgentCell, Pathology};
use genos_orchestrator::GenosEcosystem;

fn main() {
    println!("=== MISSION AUTONOME : buts endogenes (drives) ===\n");

    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("sain", "h", "Worker"))
        .unwrap();
    let mut sick = AgentCell::new("malade", "s", "Worker");
    sick.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 12.0 });
    eco.orchestrator.add_worker("Arena", sick).unwrap();

    let drives = eco.drives();
    println!(
        "[DRIVES] energie={:.2} integrite={:.2} curiosite={:.2}",
        drives.energy, drives.integrity, drives.curiosity
    );
    println!("[GOAL] but choisi initialement : {:?}", eco.autonomous_goal());

    let report = eco.run_autonomous(8);
    println!(
        "\n[AUTONOME] ticks={} halted={} atteint={} arret={:?}",
        report.ticks, report.halted, report.reached, report.halt_reason
    );
    println!("           buts poursuivis : {:?}", report.goals);
    println!("           concepts executes : {:?}", report.executed);
    println!(
        "           agents {} -> {} | traces={}",
        report.agents_before, report.agents_after, report.traces
    );

    assert!(report.halted, "raison={:?}", report.halt_reason);
    assert!(
        report.goals.iter().any(|g| g.contains("RecoverAgent")),
        "goals={:?}",
        report.goals
    );
    println!("\nMISSION AUTONOME VALIDEE");
}
