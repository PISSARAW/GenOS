use genos_orchestrator::BiomimeticOrchestrator;
use genos_cell::AgentCell;
use genos_genome::genome::{Genome, YamanakaCocktail};
use genos_genome::gene::ChromatinState;
use genos_cell::Organelle;

fn main() {
    println!("🧪 DÉMARRAGE DE L'EXPÉRIENCE BIOMIMÉTIQUE DE GENOS 🧪");
    
    // 1. Initialiser l'orchestrateur
    let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
    println!("> Orchestrateur 'Overmind' initialisé.");
    
    // 2. Création de deux agents
    let host = AgentCell::new("Codeur", "Le Créateur", "Architect");
    let symbiont = AgentCell::new("Testeur", "Le Vérificateur", "Verifier");
    
    let host_id = host.cell_id;
    let symbiont_id = symbiont.cell_id;
    
    orchestrator.active_cells.insert(host_id, host);
    orchestrator.active_cells.insert(symbiont_id, symbiont);
    
    println!("> Deux cellules créées : [Hôte: Codeur] et [Symbionte: Testeur].");
    
    // 3. Démonstration de Yamanaka (Reprogrammation)
    println!("\n🧬 ÉTAPE 1 : REPROGRAMMATION ÉPIGÉNÉTIQUE (YAMANAKA)");
    let mut genome = Genome::new("BASE_GENOME");
    // Ajouter des gènes
    let mut gene1 = genos_genome::gene::Gene::new("FRONTEND_SKILL", "ATGC");
    gene1.chromatin_state = ChromatinState::HeterochromatinFacultative;
    gene1.developmentally_locked = true;
    genome.insert_gene(gene1);
    
    println!("- Gène FRONTEND_SKILL verrouillé (HeterochromatinFacultative).");
    
    let cocktail = YamanakaCocktail {
        chromatin_decondensation_rate: 1.0,
        synaptic_retention_ratio: 0.9,
        target_potency: "Pluripotent".to_string(),
    };
    
    println!("- Application du Cocktail de Yamanaka...");
    genome.reprogram_epigenetics(&cocktail);
    
    let g1 = genome.genes.get("FRONTEND_SKILL").unwrap();
    println!("- État du gène après traitement : {:?} (Locked: {})", g1.chromatin_state, g1.developmentally_locked);
    
    // 4. Démonstration de l'Endosymbiose
    println!("\n🦠 ÉTAPE 2 : ENDOSYMBIOSE EUCARYOTE (ZERO-IPC)");
    println!("- Fusion de [Codeur] et [Testeur]...");
    
    if let Err(e) = orchestrator.trigger_endosymbiosis(host_id, symbiont_id) {
        println!("- Erreur lors de l'endosymbiose : {}", e);
    } else {
        println!("- Endosymbiose réussie ! Le Testeur a été phagocyté par le Codeur.");
    }
    
    let host_cell = orchestrator.active_cells.get(&host_id).unwrap();
    println!("- Le Codeur possède maintenant {} organite(s).", host_cell.organelles.len());
    
    if let Organelle::Endosymbiont { role, .. } = &host_cell.organelles[0] {
        println!("- L'organite a conservé son rôle de : {}", role);
        println!("- Il partage désormais la même mémoire vive (Zero-IPC) que le Codeur !");
    }
    
    println!("\n✅ EXPÉRIENCE TERMINÉE AVEC SUCCÈS !");
}
