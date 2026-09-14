use genos_orchestrator::organization::{by_name, Exchange, Routing, Topology, Visibility};
use genos_orchestrator::{
    catalog, select_organization, select_superorganism, Director, Goal, Superorganism, WorldState,
};

#[test]
fn catalogue_contient_les_19_organisations() {
    assert_eq!(catalog().len(), 19);

    let rb = by_name("red_blue_coevolution").expect("organisation presente");
    assert_eq!(rb.topology, Topology::AdversarialTriangle);
    assert_eq!(rb.exchange, Exchange::Active);
    assert_eq!(rb.visibility, Visibility::Attributed);
    assert_eq!(rb.routing, Routing::AdversarialPair);

    let st = by_name("stigmergy").expect("organisation presente");
    assert_eq!(st.topology, Topology::SharedEnvironment);
    assert_eq!(st.routing, Routing::SharedTrail);

    assert!(by_name("inexistante").is_none());
}

#[test]
fn le_directeur_choisit_l_organisation_selon_l_etat() {
    let goal = Goal::SecurePerimeter;
    let mut state = WorldState {
        workers: 3,
        tissues: 1,
        threat: 0.0,
        ..Default::default()
    };
    assert_eq!(
        select_organization(&state, &goal).name,
        "specialist_expert_committee"
    );

    state.adversary = true;
    assert_eq!(select_organization(&state, &goal).name, "red_blue_coevolution");

    state.adversary = false;
    state.uncertain = true;
    assert_eq!(
        select_organization(&state, &goal).name,
        "brier_weighted_consensus"
    );

    state.uncertain = false;
    state.diseased = 2;
    assert_eq!(select_organization(&state, &goal).name, "isolated_recovery");

    state.diseased = 0;
    state.budget = 5.0;
    assert_eq!(select_organization(&state, &goal).name, "energy_huddle");
}

#[test]
fn forme_superieure_choisie_avec_repli() {
    let small = WorldState {
        workers: 1,
        ..Default::default()
    };
    let big = WorldState {
        workers: 6,
        ..Default::default()
    };

    // Le syncytium exige au moins 2 agents.
    assert!(!Superorganism::Syncytium.is_available(&small));
    assert!(Superorganism::Syncytium.is_available(&big));

    // Pour réparer avec un grand groupe : syncytium (mémoire partagée).
    assert_eq!(
        select_superorganism(&big, &Goal::RepairModule),
        Superorganism::Syncytium
    );

    // Repli : la forme choisie est toujours viable.
    let chosen = select_superorganism(&small, &Goal::SecurePerimeter);
    assert!(chosen.is_available(&small));
}

#[test]
fn la_decision_du_directeur_porte_l_organisation() {
    let director = Director::new();
    let state = WorldState {
        workers: 3,
        tissues: 1,
        threat: 0.8,
        ..Default::default()
    };

    // Menace non observée -> stigmergie.
    let decision = director.decide(&state, &Goal::SecurePerimeter);
    assert_eq!(decision.organization.name, "stigmergy");

    // Après reconnaissance, l'organisation change.
    let mut observed = state.clone();
    observed.observed = true;
    let decision2 = director.decide(&observed, &Goal::SecurePerimeter);
    assert_ne!(decision2.organization.name, "stigmergy");
}
