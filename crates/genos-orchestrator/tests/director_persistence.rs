//! Vérifie que l'expérience apprise par le directeur (Phase 4) survit
//! réellement à un redémarrage du processus (pas seulement en mémoire tant
//! que le processus tourne), et que le paramètre organisationnel de
//! régulation `stress_cost_weight` s'ajuste automatiquement à partir de
//! l'expérience observée, sans intervention externe.

use genos_orchestrator::{context_from_state, Concept, GenosEcosystem, WorldState};

fn temp_dir(name: &str) -> std::path::PathBuf {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("genos-director-{name}-{}-{}", std::process::id(), unique))
}

fn stressed_context() -> Vec<f64> {
    context_from_state(&WorldState {
        stress: 0.9,
        adversary: true,
        ..Default::default()
    })
}

#[test]
fn l_experience_du_directeur_survit_a_un_redemarrage_du_processus() {
    let dir = temp_dir("restart");

    // "Processus" 1 : entraîne le directeur puis persiste sur disque.
    let mut before = GenosEcosystem::new("Overmind");
    let context = stressed_context();
    before.director.set_context(context.clone());
    for _ in 0..10 {
        before.director.record(Concept::Virology, true);
    }
    let learned_prediction = before.director.learner.predict(Concept::Virology, &context);
    assert!(learned_prediction > 0.5, "l'apprentissage doit deplacer la prediction");
    before.save_director_state(&dir).expect("sauvegarde du directeur");

    // "Processus" 2 : un directeur tout neuf (comme après redémarrage), sans
    // aucun apprentissage en mémoire, recharge l'expérience depuis le disque.
    let mut after = GenosEcosystem::new("Overmind");
    assert_eq!(after.director.learner.updates(Concept::Virology), 0);
    let reloaded = after.load_latest_director_state(&dir).expect("rechargement du directeur");
    assert!(reloaded, "une experience persistee doit avoir ete retrouvee");
    assert_eq!(
        after.director.learner.updates(Concept::Virology),
        before.director.learner.updates(Concept::Virology)
    );
    let reloaded_prediction = after.director.learner.predict(Concept::Virology, &context);
    assert!(
        (reloaded_prediction - learned_prediction).abs() < 1e-9,
        "la prediction rechargee doit correspondre a l'experience persistee"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn labsence_de_snapshot_ne_recharge_rien() {
    let dir = temp_dir("empty");
    let mut eco = GenosEcosystem::new("Overmind");
    let reloaded = eco.load_latest_director_state(&dir).expect("ouverture du coffre vide");
    assert!(!reloaded, "aucune experience ne doit etre trouvee dans un coffre vide");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn le_cout_du_stress_sadapte_automatiquement_selon_les_issues_observees() {
    let mut eco = GenosEcosystem::new("Overmind");
    let baseline = eco.director.stress_cost_weight;
    eco.director.set_context(stressed_context());

    // Sous fort stress, "Therapy" (cout >= 4.0) reussit systematiquement :
    // le cout est sur-pondere, donc stress_cost_weight doit diminuer seul.
    for _ in 0..30 {
        eco.director.record(Concept::Therapy, true);
    }
    assert!(
        eco.director.stress_cost_weight < baseline,
        "stress_cost_weight devrait diminuer automatiquement (succes malgre le cout) : {} >= {}",
        eco.director.stress_cost_weight,
        baseline
    );
}
