use genos_orchestrator::{Concept, Director, Goal, WorldState};

fn concepts(decision: &genos_orchestrator::Decision) -> Vec<Concept> {
    decision.steps.iter().map(|s| s.concept).collect()
}

#[test]
fn licence_le_directeur_choisit_les_concepts_du_but() {
    let mut state = WorldState {
        tissues: 0,
        workers: 0,
        threat: 0.8,
        diseased: 1,
        ..Default::default()
    };
    let goal = Goal::SecurePerimeter;
    let director = Director::new();

    let decision = director.decide(&state, &goal);
    assert!(decision.halt.is_none(), "un plan doit etre propose");
    let chosen = concepts(&decision);
    assert!(chosen.contains(&Concept::Organize), "organiser d'abord");
    assert!(chosen.contains(&Concept::Recruit), "recruter des agents");
    assert!(
        chosen.iter().any(|c| matches!(c, Concept::Immune | Concept::Virology)),
        "defendre contre la menace"
    );
    assert!(
        chosen.iter().any(|c| matches!(c, Concept::Therapy | Concept::Spore | Concept::Glia)),
        "soigner les malades"
    );

    // Exécution simulée du plan : le but est atteint.
    for step in &decision.steps {
        state.apply(step.concept);
    }
    assert!(state.goal_reached(&goal), "le plan doit atteindre l'objectif");
}

#[test]
fn master_apprend_et_change_de_decision() {
    let state = WorldState {
        tissues: 0,
        workers: 0,
        threat: 0.9,
        ..Default::default()
    };
    let goal = Goal::SecurePerimeter;
    let mut director = Director::new();

    // 1er plan : contient une défense.
    let first = concepts(&director.decide(&state, &goal));
    assert!(first.iter().any(|c| matches!(c, Concept::Immune | Concept::Virology)));

    // Échec de Immune : le directeur apprend et l'exclut.
    let mut state2 = state.clone();
    director.note_failure(Concept::Immune, &mut state2);
    assert_eq!(director.stats.get(&Concept::Immune).unwrap().attempts, 1);
    assert_eq!(director.stats.get(&Concept::Immune).unwrap().successes, 0);

    // 2e plan : Immune écarté, on s'appuie sur Virology.
    let second = concepts(&director.decide(&state2, &goal));
    assert!(!second.contains(&Concept::Immune), "concept defaillant exclu");
    assert!(second.contains(&Concept::Virology), "defense de repli utilisee");

    // Succès répétés : le taux de confiance remonte.
    director.record(Concept::Immune, true);
    director.record(Concept::Immune, true);
    assert!(director.stats.get(&Concept::Immune).unwrap().rate() > 0.5);
}

#[test]
fn doctorat_soigne_tue_communique_et_s_arrete() {
    let director = Director::new();

    // Soigner : un agent malade.
    let sick = WorldState {
        tissues: 1,
        workers: 3,
        diseased: 1,
        threat: 0.0,
        ..Default::default()
    };
    let heal = concepts(&director.decide(&sick, &Goal::RecoverAgent));
    assert!(heal.iter().any(|c| matches!(c, Concept::Therapy | Concept::Spore | Concept::Glia)));

    // Tuer : un traître confirmé.
    let mut with_traitor = WorldState {
        tissues: 1,
        workers: 3,
        traitor: true,
        ..Default::default()
    };
    let kill = concepts(&director.decide(&with_traitor, &Goal::SecurePerimeter));
    assert!(kill.contains(&Concept::Kill), "un traître doit etre elimine");

    // Communiquer : incertitude nécessitant un humain.
    with_traitor.traitor = false;
    with_traitor.uncertain = true;
    let talk = concepts(&director.decide(&with_traitor, &Goal::SecurePerimeter));
    assert!(talk.contains(&Concept::Communicate), "informer/consulter l'humain");

    // S'arrêter : problème déclaré insoluble.
    let insolvable = WorldState {
        unsolvable: true,
        ..Default::default()
    };
    let stop = director.decide(&insolvable, &Goal::SecurePerimeter);
    assert!(stop.halt.as_deref().unwrap().contains("insoluble"));

    // S'arrêter : plus aucun moyen pertinent (traître mais élimination déjà échouée).
    let mut exhausted = WorldState {
        tissues: 1,
        workers: 1,
        required_workers: 1,
        traitor: true,
        ..Default::default()
    };
    exhausted.failed.insert(Concept::Kill);
    let stop2 = director.decide(&exhausted, &Goal::RepairModule);
    assert!(stop2.halt.is_some(), "arsenal epuise => arret");
}
