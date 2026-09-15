use genos_orchestrator::genos_cell::{AgentCell, Pathology};
use genos_orchestrator::{Drives, GenosEcosystem, Goal, GoalSelector, Volition, WorldState};

#[test]
fn drives_derivent_du_monde_et_choisissent_un_but() {
    let sick = WorldState {
        diseased: 1,
        workers: 1,
        tissues: 1,
        ..Default::default()
    };
    assert_eq!(GoalSelector::select(&sick), Goal::RecoverAgent);

    let threat = WorldState {
        threat: 0.8,
        workers: 2,
        tissues: 1,
        ..Default::default()
    };
    assert_eq!(GoalSelector::select(&threat), Goal::SecurePerimeter);

    let tired = WorldState {
        budget_pressure: 0.8,
        workers: 1,
        tissues: 1,
        observed: true,
        ..Default::default()
    };
    assert_eq!(GoalSelector::select(&tired), Goal::Conserve);
    assert!(Drives::from_state(&tired).energy < 0.4);

    let threatened = WorldState {
        budget_pressure: 0.8,
        stress: 0.9,
        threat: 0.8,
        observed: true,
        ..Default::default()
    };
    let volition = Drives::volition(&threatened);
    assert!(volition.mission_independent);
    assert!(volition.survival_drive >= 0.7);
    assert_eq!(GoalSelector::select(&threatened), Goal::Conserve);

    let curious = WorldState {
        workers: 1,
        tissues: 1,
        observed: false,
        ..Default::default()
    };
    assert_eq!(GoalSelector::select(&curious), Goal::Explore);
}

#[test]
fn apoptose_inhibe_la_volition_sans_ressusciter_l_agent() {
    let state = WorldState { apoptotic: true, ..Default::default() };
    let volition = Volition { terminal: state.apoptotic, ..Drives::volition(&state) };
    assert!(volition.terminal);
    assert_eq!(GoalSelector::select(&state), Goal::Conserve);

    let mut eco = GenosEcosystem::new("terminal");
    eco.orchestrator.conscience_state.is_apoptotic = true;
    let report = eco.tick_autonomous();
    assert!(report.halt.is_some());
    assert!(report.executed.is_empty());
}

#[test]
fn boucle_autonome_sans_but_externe() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("sain", "h", "W"))
        .unwrap();
    let mut sick = AgentCell::new("malade", "s", "W");
    sick.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 10.0 });
    eco.orchestrator.add_worker("Arena", sick).unwrap();

    // Aucun Goal fourni : le système décide.
    let report = eco.run_autonomous(8);
    assert!(
        report.goals.iter().any(|g| g.contains("RecoverAgent")),
        "goals={:?}",
        report.goals
    );
    assert!(report.ticks >= 1);
    assert!(report.halted, "raison={:?}", report.halt_reason);
}
