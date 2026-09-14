use genos_orchestrator::{context_from_state, Concept, Director, Goal, Learner, WorldState};

#[test]
fn bandit_apprend_une_recompense_contextuelle() {
    let mut learner = Learner::new();
    let ctx = vec![1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let before = learner.predict(Concept::Feign, &ctx);
    for _ in 0..30 {
        learner.update(Concept::Feign, &ctx, 0.0);
    }
    let after = learner.predict(Concept::Feign, &ctx);
    assert!(after < before, "echecs => recompense baisse ({before} -> {after})");

    for _ in 0..60 {
        learner.update(Concept::Feign, &ctx, 1.0);
    }
    let recovered = learner.predict(Concept::Feign, &ctx);
    assert!(recovered > after, "succes => remonte");
    assert!(learner.updates(Concept::Feign) >= 90);
}

#[test]
fn assignation_de_credit_propage_au_plan() {
    let mut learner = Learner::new();
    let ctx = context_from_state(&WorldState::default());
    let plan = vec![Concept::Observe, Concept::Immune, Concept::Recruit];
    learner.assign_credit(&plan, &ctx, 1.0);
    for concept in &plan {
        assert!(learner.updates(*concept) >= 1, "{concept:?} doit recevoir du credit");
    }
    assert!(learner.episodes >= 3);
}

#[test]
fn le_directeur_transfere_son_apprentissage() {
    let mut director = Director::new();
    let state = WorldState {
        threat: 0.9,
        adversary: true,
        observed: true,
        tissues: 1,
        workers: 3,
        ..Default::default()
    };
    director.set_context(context_from_state(&state));
    for _ in 0..20 {
        director.record(Concept::Feign, false);
        director.record(Concept::Virology, true);
    }

    let context = context_from_state(&state);
    let feign = director.learner.predict(Concept::Feign, &context);
    let virology = director.learner.predict(Concept::Virology, &context);
    assert!(virology > feign, "transfert : {virology} > {feign}");

    let decision = director.decide(&state, &Goal::SecurePerimeter);
    assert!(!decision.steps.is_empty());
}
