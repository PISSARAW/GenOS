//! Exécution locale et mesures sourcées de la couche physique.
use genos_orchestrator::physical_measurements::WorkspacePhysicsConfig;
use genos_orchestrator::{GenosEcosystem, Goal};

fn main() {
    let root = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().expect("workspace"));
    let mut ecosystem = GenosEcosystem::new("mission-physics");
    ecosystem.physics.config = WorkspacePhysicsConfig::for_root(root);
    let report = ecosystem.run(&Goal::Explore, 2);
    println!(
        "mission: ticks={} reached={} executed={:?}",
        report.ticks, report.reached, report.executed
    );
    print_measurements(&ecosystem);
    if let Some(profile) = ecosystem.director.mission_physics.get("explore") {
        println!(
            "observed_episodes={} observed_atp_mean={} budget_reference={}",
            profile.consumed_atp.count,
            profile.consumed_atp.mean,
            profile.budget_reference()
        );
    }
}

fn print_measurements(ecosystem: &GenosEcosystem) {
    if let Some(receipt) = &ecosystem.physics.last_report {
        println!(
            "regime={:?} strategy={:?}",
            receipt.regime, receipt.strategy
        );
        println!(
            "inventory={:?} context_bytes={:?} dependencies={:?} coverage={:?}",
            receipt.telemetry.workspace.inventory.status,
            receipt.telemetry.context_bytes,
            receipt.telemetry.workspace.dependencies.status,
            receipt.telemetry.workspace.coverage.status
        );
        println!("diagnostics={:?}", ecosystem.physics.diagnostics);
    }
}
