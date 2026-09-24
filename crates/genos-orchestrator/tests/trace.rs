use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::trace::{diagnose, AgentTrace};
use genos_orchestrator::{GenosEcosystem, Outcome, RecordAction, Verdict};

fn trace(events: &[(Outcome, &str)]) -> AgentTrace {
    let mut t = AgentTrace::default();
    for (i, (outcome, action)) in events.iter().enumerate() {
        t.record(i as u64, action, *outcome);
    }
    t
}

#[test]
fn replay_diagnostique_les_destins() {
    let healthy = trace(&[(Outcome::Success, "compile"), (Outcome::Success, "test")]);
    assert_eq!(diagnose(&healthy.replay()), Verdict::Healthy);

    let lazy = trace(&[
        (Outcome::Wasted, "spin"),
        (Outcome::Wasted, "spin"),
        (Outcome::Success, "ping"),
    ]);
    assert_eq!(diagnose(&lazy.replay()), Verdict::Starve);

    let bad = trace(&[
        (Outcome::Failure, "crash"),
        (Outcome::Failure, "crash"),
        (Outcome::Failure, "crash"),
    ]);
    assert_eq!(diagnose(&bad.replay()), Verdict::Cull);

    let looping = trace(&[
        (Outcome::Success, "loop"),
        (Outcome::Success, "loop"),
        (Outcome::Success, "loop"),
    ]);
    assert_eq!(diagnose(&looping.replay()), Verdict::NeedsMutation);

    let needy = trace(&[(Outcome::Failure, "use missing skill")]);
    assert_eq!(diagnose(&needy.replay()), Verdict::NeedsPlasmid);

    let partial = trace(&[(Outcome::Success, "a"), (Outcome::Failure, "b")]);
    assert_eq!(diagnose(&partial.replay()), Verdict::NeedsCrossover);

    assert_eq!(diagnose(&AgentTrace::default().replay()), Verdict::Healthy);
}

#[test]
fn l_orchestrateur_agit_selon_le_verdict() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("A", "role").unwrap();
    let good = eco
        .orchestrator
        .add_worker("A", AgentCell::new("good", "g", "W"))
        .unwrap();
    let lazy = eco
        .orchestrator
        .add_worker("A", AgentCell::new("lazy", "l", "W"))
        .unwrap();
    let bad = eco
        .orchestrator
        .add_worker("A", AgentCell::new("bad", "b", "W"))
        .unwrap();
    let needy = eco
        .orchestrator
        .add_worker("A", AgentCell::new("needy", "n", "W"))
        .unwrap();

    eco.record_action(RecordAction { agent: good, action: "compile", outcome: Outcome::Success });
    eco.record_action(RecordAction { agent: good, action: "test", outcome: Outcome::Success });
    eco.record_action(RecordAction { agent: lazy, action: "spin", outcome: Outcome::Wasted });
    eco.record_action(RecordAction { agent: lazy, action: "spin", outcome: Outcome::Wasted });
    for _ in 0..3 {
        eco.record_action(RecordAction { agent: bad, action: "crash", outcome: Outcome::Failure });
    }
    eco.record_action(RecordAction { agent: needy, action: "use missing skill", outcome: Outcome::Failure });

    // Le replay produit des verdicts distincts.
    assert_eq!(eco.review_agents().len(), 4);
    assert_eq!(eco.diagnose_agent(good), Verdict::Healthy);
    assert_eq!(eco.diagnose_agent(lazy), Verdict::Starve);
    assert_eq!(eco.diagnose_agent(bad), Verdict::Cull);
    assert_eq!(eco.diagnose_agent(needy), Verdict::NeedsPlasmid);

    // Famine : le budget cognitif chute.
    let before = eco
        .orchestrator
        .active_cells
        .get(&lazy)
        .unwrap()
        .conscience
        .current_budget;
    eco.act_on_verdict(lazy);
    let after = eco
        .orchestrator
        .active_cells
        .get(&lazy)
        .unwrap()
        .conscience
        .current_budget;
    assert!(after < before, "famine => budget reduit");

    // Plasmide : la banque s'enrichit (compétence transférée).
    let bank_before = eco.plasmids.count();
    eco.act_on_verdict(needy);
    assert!(eco.plasmids.count() > bank_before);

    // Suppression : l'agent quitte les cellules actives et son tissu.
    eco.act_on_verdict(bad);
    assert!(!eco.orchestrator.active_cells.contains_key(&bad));
    assert!(!eco
        .orchestrator
        .tissues
        .get("A")
        .unwrap()
        .somatic_cells
        .contains(&bad));
}

#[test]
fn mutation_et_croisement_sont_executes_sur_l_adn() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("A", "role").unwrap();
    let a = eco
        .orchestrator
        .add_worker("A", AgentCell::new("a", "a", "W"))
        .unwrap();
    let b = eco
        .orchestrator
        .add_worker("A", AgentCell::new("b", "b", "W"))
        .unwrap();

    let genome = genos_orchestrator::genos_genome::Genome::new("BASE");
    let dna = genos_orchestrator::dna_ops::from_genome(&genome, "seed");
    eco.register_dna(a, dna.clone());
    eco.register_dna(b, dna);

    // Mutation : majorité d'échecs.
    eco.record_action(RecordAction { agent: a, action: "crash", outcome: Outcome::Failure });
    eco.record_action(RecordAction { agent: a, action: "crash", outcome: Outcome::Failure });
    assert_eq!(eco.diagnose_agent(a), Verdict::NeedsMutation);
    let (_, note) = eco.act_on_verdict(a);
    assert!(note.contains("mutation"), "note = {note}");

    // Croisement : succès partiel.
    eco.record_action(RecordAction { agent: b, action: "ok", outcome: Outcome::Success });
    eco.record_action(RecordAction { agent: b, action: "ko", outcome: Outcome::Failure });
    assert_eq!(eco.diagnose_agent(b), Verdict::NeedsCrossover);
    let (_, note2) = eco.act_on_verdict(b);
    assert!(note2.contains("croisement"), "note = {note2}");
}

#[test]
fn plasmide_porte_une_competence_executable() {
    use genos_orchestrator::Skill;

    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("A", "role").unwrap();
    let a = eco
        .orchestrator
        .add_worker("A", AgentCell::new("a", "a", "W"))
        .unwrap();

    // Budget cognitivement épuisé puis réparé par compétence.
    eco.orchestrator
        .active_cells
        .get_mut(&a)
        .unwrap()
        .conscience
        .current_budget = 10.0;
    let note = eco.execute_skill(a, Skill::Repair);
    assert!(note.contains("restaure"), "note = {note}");
    assert_eq!(
        eco.orchestrator
            .active_cells
            .get(&a)
            .unwrap()
            .conscience
            .current_budget,
        100.0
    );

    // Le plasmide standard encode la compétence.
    let plasmid = genos_orchestrator::PlasmidBank::for_skill(Skill::Throttle);
    assert_eq!(plasmid.skill_name, "SKILL_THROTTLE");
    assert_eq!(Skill::parse(&plasmid.executable_payload), Some(Skill::Throttle));
}

