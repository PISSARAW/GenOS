//! MISSION organisme (Phase 7) : boucle unifiée.
//!
//! Un seul cycle qui perçoit, se régule (auto-réparation + nourriture), décide
//! (but endogène), agit, consomme de l'ATP et apprend — sans intervention
//! externe, jusqu'à la mort éventuelle.

use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, OrganismConfig};

fn main() {
    println!("=== MISSION ORGANISME : percevoir -> reguler -> decider -> agir -> apprendre ===\n");

    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("ouvrier", "o", "Worker"))
        .unwrap();

    // Conditions initiales : frontière usée et faim.
    eco.orchestrator.membrane.degrade_per_sec = 0.5;
    eco.orchestrator.membrane.integrity = 0.8;
    eco.orchestrator.metabolism.atp = 8.0;

    let config = OrganismConfig::default();
    let reports = eco.run_organism(&config, 6);

    for report in &reports {
        println!(
            "[TICK {}] but={:<18} vivant={} integrite={:.2} atp={:.1} feed={} repairs={} exec={:?} arret={:?}",
            report.tick,
            report.goal,
            report.alive,
            report.integrity,
            report.atp,
            report.fed,
            report.repairs.len(),
            report.executed,
            report.halt
        );
    }

    let survived = reports.iter().all(|report| report.alive);
    let last = reports.last().expect("au moins un cycle");
    println!(
        "\n[BILAN] cycles={} survie={} integrite finale={:.2} atp final={:.1} tissus={} composants={}",
        reports.len(),
        survived,
        last.integrity,
        last.atp,
        eco.orchestrator.tissues.len(),
        eco.orchestrator.active_cells.len()
    );

    assert!(survived, "l'organisme doit rester vivant");
    assert!(!reports.is_empty());
    println!("MISSION ORGANISME VALIDEE");
}
