//! MISSION : recruter des agents spécialisés à partir des ADN déjà présents.
//!
//! L'orchestrateur découvre les génomes encodés (`agents/dna/**/*.dna`),
//! décode l'ADN de chaque agent, exprime son phénotype (rôle, outils,
//! capacités), recrute les spécialistes requis dans un tissu, puis conduit une
//! opération de sécurisation dont le succès est vérifié.
//!
//! Livrable vérifiable : tous les rôles requis sont recrutés, l'ADN de chaque
//! recrue fait un aller-retour codec stable, et les actions de la mission
//! réussissent.

use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_dna::model::AgentDna;
use genos_orchestrator::genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::{GenosEcosystem, dna_ops};
use std::collections::BTreeMap;
use std::path::Path;
use uuid::Uuid;

struct Specialist {
    dna: AgentDna,
    name: String,
    role: String,
    tools: Vec<String>,
    capabilities: Vec<String>,
}

fn load_specialists(dir: &Path) -> Vec<Specialist> {
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return out,
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
            tools: pheno.tools.clone(),
            capabilities: pheno.capabilities.clone(),
            dna,
        });
    }
    out
}

fn pick<'a>(roster: &'a [Specialist], role: &str) -> Option<&'a Specialist> {
    roster.iter().find(|s| s.role == role)
}

fn main() {
    println!("=== MISSION : recruter des agents specialises depuis les ADN ===\n");

    // 1. Découverte des génomes encodés.
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../agents/dna/biomimetique");
    let roster = load_specialists(&dir);
    assert!(roster.len() >= 6, "au moins 6 ADN decodables attendus");
    println!("[1] {} ADN d'agents decodes depuis {}", roster.len(), dir.display());

    // 2. Exigences de la mission : roles necessaires.
    let required = [
        "sentinel",
        "regulator",
        "navigator",
        "immune_symbiont",
        "independent_solver",
        "arbiter",
    ];
    let mut selected: Vec<&Specialist> = Vec::new();
    for role in required {
        let agent = pick(&roster, role).unwrap_or_else(|| panic!("role manquant: {role}"));
        selected.push(agent);
    }
    println!("[2] Selection de {} specialistes requis", selected.len());

    // 3. Recrutement dans le tissu Biome.
    let mut eco = GenosEcosystem::new("Griot_Prime");
    eco.orchestrator.create_tissue("Biome", "Specialistes").unwrap();
    let mut assigned: BTreeMap<String, Uuid> = BTreeMap::new();
    for agent in &selected {
        let cell = AgentCell::new(agent.name.clone(), agent.role.clone(), agent.role.clone());
        let id = eco.orchestrator.add_worker("Biome", cell).unwrap();
        eco.orchestrator
            .delegate_task("Biome", (id, "operation de securisation"))
            .unwrap();
        assigned.insert(agent.role.clone(), id);
    }
    println!("[3] Recrutement :");
    for agent in &selected {
        println!(
            "    - {:<20} role={:<18} outils={} capacites={}",
            agent.name,
            agent.role,
            agent.tools.len(),
            agent.capabilities.len()
        );
    }
    assert_eq!(assigned.len(), required.len());

    // 4. Preuve d'intégrité de l'ADN de chaque recrue (codec aller-retour).
    for agent in &selected {
        let before = dna_ops::content_hash(&agent.dna).unwrap();
        let bytes = dna_ops::encode(&agent.dna).unwrap();
        let decoded = dna_ops::decode(&bytes).unwrap();
        let after = dna_ops::content_hash(&decoded).unwrap();
        assert_eq!(before, after, "ADN instable pour {}", agent.name);
    }
    println!("[4] Integrite ADN verifiee pour les {} recrues", selected.len());

    // 5. Opération de sécurisation, chaque rôle agit via son sous-système.

    // sentinel : interception d'une injection de prompt.
    eco.orchestrator
        .immune_selection
        .detectors
        .push(AntibodyDetector::new("inj", "PROMPT_INJECTION", 0.8));
    let threat = Antigen {
        id: "threat-1".into(),
        epitope: "PROMPT_INJECTION".into(),
        danger_level: 0.95,
    };
    let intercepted = eco.orchestrator.detect_immune_threat(&threat);
    assert!(intercepted);

    // regulator : throttling du flux d'entrée.
    let throttle = eco.throttle_flux(250.0);
    assert!(throttle.admitted_flux <= 250.0);

    // navigator : cartographie par électro-localisation.
    let _scan = eco.senses.electrolocate(&[0.8, 1.0, 1.2, 0.9]);

    // environment mapper : recensement des tissus.
    let tissue_count = eco.orchestrator.tissues.len();

    // immune_symbiont : contrôle de conformité au contrat.
    let compliant = eco
        .orchestrator
        .audit_collusion("Biome", ("ImmuneSymbiont", 1200, true))
        .is_ok();

    // arbiter + quorum_sensor : consensus collectif.
    eco.quorum.add_cells(1000);
    eco.quorum.step(1.0);
    let activation = eco.quorum.activation_level();

    // independent_solver : production de la preuve (tous les rôles couverts).
    let proof = assigned.len() == required.len();

    println!("[5] Operation : interception={intercepted}, throttle={:.1}, tissus={tissue_count}, conformite={compliant}, activation={activation:.2}, preuve={proof}",
        throttle.admitted_flux);

    // 6. Télémétrie.
    eco.orchestrator.emit_bioluminescence(
        genos_orchestrator::genos_biology::bioluminescence::FluorophoreColor::Green,
        "Nucleus",
        ("RECRUITMENT", "biome operationnel"),
    );

    // --- Livrable vérifiable ---
    assert!(intercepted && compliant && proof);
    assert!(eco.orchestrator.tissues.contains_key("Biome"));
    for role in required {
        assert!(assigned.contains_key(role), "role non recrute: {role}");
    }
    println!("\nBIOME OPERATIONNEL : {} specialistes recrutes, tous roles couverts", selected.len());
    println!("MISSION RECRUTEMENT VALIDEE");
}
