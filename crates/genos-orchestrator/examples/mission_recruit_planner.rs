//! MISSION : recrutement AUTONOME depuis les ADN existants.
//!
//! Contrairement à la mission précédente (sélection codée en dur), ici
//! l'orchestrateur reçoit une **demande** (rôles/capacités + budget) et un
//! vivier de candidats issus des ADN, puis **décide lui-même** qui recruter,
//! qui refuser et pourquoi. Le harness n'indique plus de nom.

use genos_orchestrator::{Candidate, Demand, GenosEcosystem, dna_ops};
use std::path::Path;

struct Specialist {
    name: String,
    role: String,
    capabilities: Vec<String>,
}

fn load_specialists(dir: &Path) -> Vec<Specialist> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("dna") {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else { continue };
        let Ok(dna) = dna_ops::decode(&bytes) else { continue };
        let pheno = dna_ops::express(&dna);
        out.push(Specialist {
            name: dna.meta.name.clone(),
            role: pheno.role.clone(),
            capabilities: pheno.capabilities.clone(),
        });
    }
    out
}

fn main() {
    println!("=== MISSION : recrutement autonome (decision de l'orchestrateur) ===\n");

    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../agents/dna/biomimetique");
    let roster = load_specialists(&dir);
    assert!(roster.len() >= 6, "vivier insuffisant");

    // Vivier de candidats : l'ADN déclare les capacités, et (ici) elles sont prouvées.
    let mut candidates: Vec<Candidate> = roster
        .iter()
        .map(|s| Candidate {
            id: s.name.clone(),
            role: s.role.clone(),
            capabilities: s.capabilities.clone(),
            proven: s.capabilities.clone(),
            cost: 8.0,
        })
        .collect();
    // Un imposteur se présente : il déclare un rôle mais ne prouve rien.
    candidates.push(Candidate {
        id: "FakeGuard".to_string(),
        role: "sentinel".to_string(),
        capabilities: vec!["interception de menaces".to_string()],
        proven: vec![],
        cost: 1.0,
    });
    println!("[1] Vivier : {} candidats (dont 1 imposteur)", candidates.len());

    // Demande : rôles requis + budget. Le harness ne nomme AUCUN agent.
    let demand = Demand {
        roles: vec![
            "sentinel".into(),
            "regulator".into(),
            "navigator".into(),
            "immune_symbiont".into(),
            "independent_solver".into(),
            "arbiter".into(),
        ],
        capabilities: vec![],
        budget: 100.0,
    };
    println!("[2] Demande : {} roles, budget {:.0}", demand.roles.len(), demand.budget);

    // L'orchestrateur décide ET exécute.
    let mut eco = GenosEcosystem::new("Griot_Prime");
    let decision = eco.recruit("Biome", &demand, &candidates);

    println!("\n[3] DECISION DE L'ORCHESTRATEUR");
    println!("    faisable = {} | depense = {:.1}", decision.feasible, decision.spent);
    println!("    retenus :");
    for s in &decision.selected {
        println!("      {:<18} <- role '{}' (score {:.2}, cout {:.1})", s.candidate, s.key, s.score, s.cost);
    }
    println!("    rejetes :");
    for (id, reason) in &decision.rejected {
        let who = if id.is_empty() { "<demande>" } else { id.as_str() };
        println!("      {who}: {reason}");
    }

    // --- Livrable vérifiable ---
    assert!(decision.feasible);
    assert_eq!(decision.selected.len(), demand.roles.len());
    // L'imposteur a bien été écarté.
    assert!(decision
        .rejected
        .iter()
        .any(|(id, reason)| id == "FakeGuard" && reason.contains("imposteur")));
    // Aucun imposteur retenu.
    assert!(!decision.selected.iter().any(|s| s.candidate == "FakeGuard"));
    // L'exécution a peuplé le tissu.
    assert_eq!(
        eco.orchestrator.tissues.get("Biome").unwrap().somatic_cells.len(),
        decision.selected.len()
    );

    println!("\nBIOME CONSTITUE AUTONOMEMENT : {} agents retenus sur {} candidats",
        decision.selected.len(), candidates.len());
    println!("MISSION RECRUTEMENT AUTONOME VALIDEE");
}
