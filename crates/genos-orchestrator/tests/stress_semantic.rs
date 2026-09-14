use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{
    select_organization, Director, GenosEcosystem, Goal, Strategy, WorldState,
};

#[test]
fn stress_pese_sur_l_organisation() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let mut sick = AgentCell::new("x", "x", "W");
    sick.clinical.inflammatory_index = 25.0;
    eco.orchestrator.add_worker("Arena", sick).unwrap();
    eco.orchestrator.conscience_state.dissonance_level = 50.0;

    let state = eco.observe();
    assert!(state.dissonance > 0.0);
    assert!(state.il6 > 0.0);
    assert!(state.budget_pressure > 0.0);
    assert!(state.stress >= 0.75, "stress = {}", state.stress);

    assert_eq!(
        select_organization(&state, &Goal::SecurePerimeter).name,
        "network_silence"
    );
}

#[test]
fn beam_search_produit_un_plan_qui_atteint_le_but() {
    let director = Director::new();
    let goal = Goal::SecurePerimeter;
    let mut state = WorldState {
        threat: 0.8,
        diseased: 1,
        ..Default::default()
    };
    let steps = director.plan_strategy(Strategy::Biome, &state, &goal);
    assert!(!steps.is_empty());
    assert!(steps.len() <= director.max_steps + 4);
    for step in &steps {
        state.apply(step.concept);
    }
    assert!(state.goal_reached(&goal), "le plan beam doit atteindre le but");
}

#[test]
fn interpretation_semantique_de_la_mission() {
    let mut eco = GenosEcosystem::new("Overmind");

    let (goal, constraints) =
        eco.interpret_mission("Réparer le module défaillant sous contrainte de budget");
    assert_eq!(goal, Goal::RepairModule);
    assert!(constraints.contains(&"budget_serre".to_string()));

    let (goal, _) = eco.interpret_mission("Sécuriser le périmètre contre les menaces");
    assert_eq!(goal, Goal::SecurePerimeter);

    let (goal, _) = eco.interpret_mission("Soigner l'agent malade");
    assert_eq!(goal, Goal::RecoverAgent);

    // Exécution d'une mission textuelle de bout en bout.
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    eco.orchestrator
        .add_worker("Arena", AgentCell::new("a", "a", "W"))
        .unwrap();
    let report = eco.run_mission("sécuriser le périmètre", 6);
    assert!(report.ticks >= 1);
}
