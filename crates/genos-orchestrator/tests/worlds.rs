use genos_orchestrator::{Goal, Multiverse, WorldState};

#[test]
fn trinity_execute_trois_mondes_isoles_et_promeut_le_meilleur() {
    let initial = WorldState {
        tissues: 0,
        workers: 0,
        threat: 0.6,
        diseased: 1,
        ..Default::default()
    };
    let goal = Goal::SecurePerimeter;

    let result = Multiverse::trinity(&goal, &initial);

    // Trois mondes distincts.
    assert_eq!(result.worlds.len(), 3);
    let names: Vec<&str> = result.worlds.iter().map(|w| w.hypothesis.name()).collect();
    assert!(names.contains(&"basic") && names.contains(&"planned") && names.contains(&"self_correcting"));

    // Isolation stricte : l'état initial n'est pas muté.
    assert_eq!(initial.workers, 0);
    assert_eq!(initial.diseased, 1);

    // Un monde franchit la barrière de preuve.
    let winner = result.winner().expect("un monde promu");
    assert!(winner.reached || winner.progress >= 0.75);
    assert!(!winner.organization.is_empty());

    // Fusion : union des concepts testés.
    let merged = result.merged_steps();
    assert!(merged.contains(&genos_orchestrator::Concept::Recruit));
}

#[test]
fn budget_insuffisant_escalade_sans_promotion() {
    let initial = WorldState {
        tissues: 0,
        workers: 0,
        threat: 0.9,
        budget: 3.0,
        ..Default::default()
    };
    let result = Multiverse::trinity(&Goal::SecurePerimeter, &initial);
    assert!(result.promoted.is_none(), "aucun monde ne doit etre promu");
    assert!(result.reason.contains("escalade"));
}
