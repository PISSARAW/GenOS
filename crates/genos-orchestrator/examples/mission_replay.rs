//! MISSION : replay des agents -> destin (mutation / plasmide / famine / suppression).
//!
//! L'orchestrateur enregistre ce que fait chaque agent, rejoue sa trace, en
//! déduit un verdict, puis agit : soigner, affamer, transférer un plasmide
//! (compétence), ou supprimer l'agent.

use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::{GenosEcosystem, Outcome, Verdict};

fn short(id: uuid::Uuid) -> String {
    id.to_string()[..8].to_string()
}

fn main() {
    println!("=== MISSION : replay des agents et destin ===\n");

    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Arena", "Execution").unwrap();
    let artisan = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Artisan", "a", "Worker"))
        .unwrap();
    let boucleur = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Boucleur", "b", "Worker"))
        .unwrap();
    let gaspill = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Gaspilleur", "c", "Worker"))
        .unwrap();
    let casse = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Cassee", "d", "Worker"))
        .unwrap();
    let novice = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("Novice", "e", "Worker"))
        .unwrap();

    // Traces d'actions simulées (ce que les agents ont réellement fait).
    eco.record_action(artisan, "build", Outcome::Success);
    eco.record_action(artisan, "test", Outcome::Success);
    for _ in 0..3 {
        eco.record_action(boucleur, "retry", Outcome::Success); // boucle
    }
    for _ in 0..3 {
        eco.record_action(gaspill, "spam", Outcome::Wasted); // gaspillage
    }
    for _ in 0..3 {
        eco.record_action(casse, "crash", Outcome::Failure); // incompétent
    }
    eco.record_action(novice, "use missing skill", Outcome::Failure); // compétence absente

    println!("[1] Replay + diagnostic :");
    for (id, verdict) in eco.review_agents() {
        let report = eco.replay_agent(id);
        println!(
            "    {:<8} essais={} succes={} echecs={} gaspillage={} repetition={} -> {}",
            short(id),
            report.attempts,
            report.successes,
            report.failures,
            report.wasted,
            report.repetition,
            verdict.label()
        );
    }

    println!("\n[2] Application des verdicts :");
    for id in [artisan, boucleur, gaspill, casse, novice] {
        let (verdict, note) = eco.act_on_verdict(id);
        println!("    {} -> {:<10} ({note})", short(id), verdict.label());
    }

    println!(
        "\n[3] Etat final : agents actifs={} plasmides={} evenements={}",
        eco.orchestrator.active_cells.len(),
        eco.plasmids.count(),
        eco.events.count()
    );

    // --- Livrable vérifiable ---
    assert_eq!(eco.diagnose_agent(boucleur), Verdict::NeedsMutation);
    assert_eq!(eco.diagnose_agent(gaspill), Verdict::Starve);
    assert_eq!(eco.diagnose_agent(casse), Verdict::Cull);
    assert_eq!(eco.diagnose_agent(novice), Verdict::NeedsPlasmid);
    assert!(!eco.orchestrator.active_cells.contains_key(&casse), "incompetent supprime");
    assert!(eco.plasmids.count() >= 1, "plasmide transfere");
    println!("\nMISSION REPLAY + DESTIN VALIDEE");
}
