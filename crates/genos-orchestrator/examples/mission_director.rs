//! MISSION : l'orchestrateur choisit seul ses concepts, apprend et s'arrête.
//!
//! Le harness ne fournit qu'un **état initial** et un **but**. À chaque tour,
//! le `Director` choisit une stratégie et une séquence de concepts ; le plan
//! est exécuté (et répercuté dans un vrai `GenosEcosystem` quand c'est
//! possible), puis le directeur apprend du résultat avant de re-décider.

use genos_orchestrator::genos_biology::spore::SporeType;
use genos_orchestrator::genos_biology::therapy::SystemicTherapy;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::{Concept, Director, GenosEcosystem, Goal, WorldState};

fn mirror(eco: &mut GenosEcosystem, concept: Concept, tick: &mut usize, armed: &mut bool) {
    match concept {
        Concept::Organize => {
            if !eco.orchestrator.tissues.contains_key("Arena") {
                let _ = eco.orchestrator.create_tissue("Arena", "Mission");
            }
        }
        Concept::Recruit => {
            if eco.orchestrator.tissues.contains_key("Arena") {
                *tick += 1;
                let _ = eco.orchestrator.add_worker(
                    "Arena",
                    AgentCell::new(format!("Recrue_{tick}"), "auto", "Specialist"),
                );
            }
        }
        Concept::Immune => {
            if !*armed {
                eco.orchestrator
                    .immune_selection
                    .detectors
                    .push(AntibodyDetector::new("auto", "THREAT", 0.8));
                *armed = true;
            }
            let _ = eco.orchestrator.detect_immune_threat(&Antigen {
                id: "threat".into(),
                epitope: "THREAT".into(),
                danger_level: 0.9,
            });
        }
        Concept::Throttle => {
            let _ = eco.throttle_flux(120.0);
        }
        Concept::Therapy => {
            let mut patient = AgentCell::new("Patient", "p", "Worker");
            let _ = eco.apply_therapy(&mut patient, &SystemicTherapy::IntensiveCareFluids);
        }
        Concept::Spore => {
            if let Some(id) = eco
                .orchestrator
                .tissues
                .get("Arena")
                .and_then(|t| t.somatic_cells.first().copied())
            {
                let _ = eco.orchestrator.sporulate_cell(id, SporeType::BacterialEndospore);
            }
        }
        _ => {}
    }
}

fn run_autonomous() {
    println!("=== PARTIE A : decision autonome jusqu'au but ===\n");
    let goal = Goal::SecurePerimeter;
    let mut state = WorldState {
        tissues: 0,
        workers: 0,
        threat: 0.7,
        diseased: 1,
        ..Default::default()
    };
    let mut director = Director::new();
    let mut eco = GenosEcosystem::new("Griot_Prime");
    let (mut tick, mut armed) = (0usize, false);

    for round in 1..=3 {
        let decision = director.decide(&state, &goal);
        println!("--- TOUR {round} ---");
        println!("  strategie : {:?}", decision.strategy);
        println!("  decision  : {}", decision.rationale);
        if let Some(reason) = &decision.halt {
            println!("  ARRET     : {reason}");
            break;
        }
        println!(
            "  plan      : {:?}",
            decision.steps.iter().map(|s| s.concept).collect::<Vec<_>>()
        );
        for step in &decision.steps {
            let before = state.progress(&goal);
            state.apply(step.concept);
            let after = state.progress(&goal);
            mirror(&mut eco, step.concept, &mut tick, &mut armed);
            director.record(step.concept, after > before || state.goal_reached(&goal));
        }
        println!(
            "  etat      : progression={:.2}, menace={:.1}, malades={}, agents={}",
            state.progress(&goal), state.threat, state.diseased, state.workers
        );
    }

    assert!(state.goal_reached(&goal), "le directeur doit atteindre le but");
    let arena = eco
        .orchestrator
        .tissues
        .get("Arena")
        .map(|t| t.somatic_cells.len())
        .unwrap_or(0);
    println!("\nBut atteint | agents reels dans l'Arena : {arena}");
}

fn run_adaptation() {
    println!("\n=== PARTIE B : changement de decision apres un echec ===\n");
    let goal = Goal::SecurePerimeter;
    let state = WorldState {
        tissues: 0,
        workers: 0,
        threat: 0.9,
        ..Default::default()
    };
    let mut director = Director::new();

    let first: Vec<Concept> = director
        .decide(&state, &goal)
        .steps
        .iter()
        .map(|s| s.concept)
        .collect();
    println!("plan initial      : {first:?}");

    let mut revised = state.clone();
    director.note_failure(Concept::Immune, &mut revised);
    let second: Vec<Concept> = director
        .decide(&revised, &goal)
        .steps
        .iter()
        .map(|s| s.concept)
        .collect();
    println!("plan apres echec  : {second:?}");

    assert!(!second.contains(&Concept::Immune), "le concept defaillant est ecarte");
    assert!(second.contains(&Concept::Virology), "repli sur un autre moyen");
    println!("Le directeur a change de moyen pour la defense.");
}

fn main() {
    run_autonomous();
    run_adaptation();
    println!("\nMISSION DECISION AUTONOME VALIDEE");
}
