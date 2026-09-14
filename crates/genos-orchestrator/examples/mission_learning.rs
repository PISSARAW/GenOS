//! MISSION apprentissage (Phase 4) : bandit contextuel + transfert.
//!
//! Le directeur apprend la récompense attendue de chaque concept **selon le
//! contexte** (menace, adversaire, maladie, stress…). L'expérience persiste et
//! se transfère aux missions suivantes.

use genos_orchestrator::{context_from_state, Concept, Director, Goal, WorldState};

fn main() {
    println!("=== MISSION APPRENTISSAGE : bandit contextuel par concept ===\n");

    let mut director = Director::new();
    let state = WorldState {
        threat: 0.9,
        adversary: true,
        observed: true,
        tissues: 1,
        workers: 3,
        ..Default::default()
    };
    let context = context_from_state(&state);
    director.set_context(context.clone());

    let before_feign = director.learner.predict(Concept::Feign, &context);
    let before_viro = director.learner.predict(Concept::Virology, &context);
    println!("[AVANT] P(Feign)={before_feign:.3}  P(Virology)={before_viro:.3}");

    // Apprentissage : face à un adversaire Trompeur, Feign échoue, Virology réussit.
    for _ in 0..20 {
        director.record(Concept::Feign, false);
        director.record(Concept::Virology, true);
    }
    let after_feign = director.learner.predict(Concept::Feign, &context);
    let after_viro = director.learner.predict(Concept::Virology, &context);
    println!("[APRES] P(Feign)={after_feign:.3}  P(Virology)={after_viro:.3}");
    assert!(after_viro > after_feign, "transfert : Virology doit primer");

    // Assignation de crédit sur un plan.
    let plan = vec![Concept::Observe, Concept::Recruit, Concept::Virology];
    director.assign_credit(&plan, 1.0);
    println!(
        "[CREDIT] mises a jour : Observe={} Recruit={} Virology={}",
        director.learner.updates(Concept::Observe),
        director.learner.updates(Concept::Recruit),
        director.learner.updates(Concept::Virology)
    );

    // Décision suivante : le directeur s'appuie sur l'expérience.
    let decision = director.decide(&state, &Goal::SecurePerimeter);
    println!(
        "[DECISION] strategie={:?} plan={:?}",
        decision.strategy,
        decision.steps.iter().map(|s| s.concept).collect::<Vec<_>>()
    );

    assert!(!decision.steps.is_empty());
    println!("\nMISSION APPRENTISSAGE VALIDEE");
}
