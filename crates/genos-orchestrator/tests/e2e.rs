use genos_orchestrator::genos_cell::{AgentCell, Pathology};
use genos_orchestrator::{Concept, GenosEcosystem, Goal, Hypothesis, Multiverse};

#[test]
fn scenario_bout_en_bout_feign_glie_thalamus() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let healthy = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("sain", "h", "W"))
        .unwrap();
    let mut sick1 = AgentCell::new("malade1", "s", "W");
    sick1.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 12.0 });
    let patient1 = eco.orchestrator.add_worker("Arena", sick1).unwrap();
    let mut sick2 = AgentCell::new("malade2", "s", "W");
    sick2.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 9.0 });
    let patient2 = eco.orchestrator.add_worker("Arena", sick2).unwrap();
    let mut sick3 = AgentCell::new("malade3", "s", "W");
    sick3.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 7.0 });
    let patient3 = eco.orchestrator.add_worker("Arena", sick3).unwrap();

    let genome = genos_orchestrator::genos_genome::Genome::new("BASE");
    let dna = genos_orchestrator::dna_ops::from_genome(&genome, "seed");
    for id in [healthy, patient1, patient2, patient3] {
        eco.register_dna(id, dna.clone());
    }
    // Deux virions actifs => menaçant (adversaire) : la feinte devient pertinente.
    eco.virology.synthesize_bacteriophage("SPIKE_A", "KILL");
    eco.virology.synthesize_bacteriophage("SPIKE_B", "KILL");

    let report = eco.run(&Goal::SecurePerimeter, 8);
    assert!(report.executed.contains(&Concept::Feign), "feinte absente : {:?}", report.executed);
    assert!(report.executed.contains(&Concept::Glia), "glie absente : {:?}", report.executed);
    assert!(
        report.executed.contains(&Concept::Communicate),
        "communication absente : {:?}",
        report.executed
    );
    assert!(report.reached, "la mission doit atteindre le but");

    // Thalamus (hors ligne : « Ping » court-circuite le réseau).
    let answer = eco.communicate("Ping");
    assert!(answer.contains("Ping") || answer.contains("Echo"), "reponse = {answer}");
}

#[test]
fn mondes_isoles_reels_en_parallele() {
    let build = |hypothesis: Hypothesis| {
        let mut eco = GenosEcosystem::new(hypothesis.name());
        eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
        let workers = match hypothesis {
            Hypothesis::Basic => 1,
            Hypothesis::Planned => 3,
            _ => 2,
        };
        for i in 0..workers {
            let _ = eco
                .orchestrator
                .add_worker("Arena", AgentCell::new(format!("w{i}"), "w", "W"));
        }
        eco.record_event("INTEL", serde_json::json!({}));
        eco
    };

    let result = Multiverse::run_isolated(&Goal::SecurePerimeter, &Hypothesis::trinity(), build);
    assert_eq!(result.worlds.len(), 3);
    assert!(result.worlds.iter().all(|w| w.progress >= 0.0));
    // Chaque monde est un écosystème distinct : au moins un franchit la barrière.
    assert!(result.winner().is_some() || result.reason.contains("escalade"));
}
