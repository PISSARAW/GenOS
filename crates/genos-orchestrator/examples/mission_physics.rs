//! MISSION physique : le monde résiste (inertie, entropie, seuils, matière).
//!
//! Boucle : percepts -> PhysicalState -> régime/contraintes -> décision gatée
//! par la physique (pas seulement la meilleure action logique).

use genos_orchestrator::{
    DecisionContext, Director, Goal, PhysicalState, Regime, Strategy, UtilityInputs, WorldState,
    action_profile, classify_material, determine_regime, utility_score,
};

fn main() {
    println!("=== MISSION PHYSIQUE : l'inerte comme monde contraignant ===\n");

    // Percept : test long + worker lent + budget bas -> friction et pression hautes.
    let state = WorldState {
        budget: 8.0,
        budget_pressure: 0.85,
        stress: 0.6,
        workers: 2,
        required_workers: 3,
        ..Default::default()
    };
    let phys = PhysicalState::derive(&state, None);
    println!(
        "[PHYSIQUE] energy={:.2} entropy={:.2} friction={:.2} pressure={:.2} inertia={:.2}",
        phys.energy, phys.entropy, phys.friction, phys.pressure, phys.inertia
    );

    let regime = determine_regime(&state, &phys);
    println!("[REGIME] {:?}", regime);
    assert_eq!(regime, Regime::Conservation, "budget bas doit forcer la conservation");

    // Comparaison d'utilite : une action lourde (Kill) vs une action legere (Observe).
    let heavy = action_profile(genos_orchestrator::Concept::Kill);
    let light = action_profile(genos_orchestrator::Concept::Observe);
    let heavy_score = utility_score(&UtilityInputs { expected_gain: 1.0, profile: &heavy, phys: &phys });
    let light_score = utility_score(&UtilityInputs { expected_gain: 1.0, profile: &light, phys: &phys });
    println!("[UTILITE] kill={:.2} observe={:.2}", heavy_score, light_score);
    assert!(light_score > heavy_score, "sous friction/pression, l'action legere doit dominer");

    // Gravite structurelle : un fichier de schema pese plus lourd qu'un fichier de log.
    let schema_material = classify_material("backend/src/db/schema.js");
    let log_material = classify_material("backend/logs/trace.log");
    println!(
        "[MATIERE] schema={:?} (preuve={:.2}) log={:?} (preuve={:.2})",
        schema_material, schema_material.required_evidence(),
        log_material, log_material.required_evidence()
    );
    assert!(schema_material.required_evidence() > log_material.required_evidence());

    // Decision gatee par la physique : entropie/pression basses ici -> pas de blocage,
    // mais l'inertie doit resister a un pivot de strategie sans gain net suffisant.
    let stable_state = WorldState { workers: 3, required_workers: 3, ..Default::default() };
    let stable_phys = PhysicalState { inertia: 0.9, pressure: 0.0, ..Default::default() };
    let goal = Goal::Explore;
    let director = Director::new();
    let ctx = DecisionContext {
        state: &stable_state,
        goal: &goal,
        phys: &stable_phys,
        previous_strategy: Some(Strategy::Biome),
    };
    let decision = director.decide_physical(&ctx);
    println!("[DECISION] strategie={:?} rationale={}", decision.strategy, decision.rationale);

    println!("\nMISSION PHYSIQUE VALIDEE");
}
