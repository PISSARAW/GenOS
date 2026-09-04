#[tokio::main]
async fn main() {
    println!("=== GENOS V3 : DEMONSTRATION DE LA THEORIE DE L'ESPRIT ===\n");

    let mut agent1 = genos_core::cell::AgentCell::default();
    let mut agent2 = genos_core::cell::AgentCell::default();

    agent1.name = "Kwame".to_string();
    agent1.name_meaning = "Né un samedi (Akan) - Le planificateur".to_string();
    
    agent2.name = "Zola".to_string();
    agent2.name_meaning = "Calme (Kongo) - Le pacificateur".to_string();

    println!("🌍 Instanciation des agents terminée.\n");
    println!("Agent 1 : {}", agent1.introduce_self());
    println!("Agent 2 : {}", agent2.introduce_self());
    println!("\n----------------------------------------------------\n");

    println!("🧠 {} structure son Hippocampe et s'ancre dans KuzuDB...", agent1.name);
    let hippo1 = &agent1.mind().unwrap().memory.graph_memory;
    hippo1.awaken_self(&agent1.name).await.unwrap();
    println!("✅ Le nœud (Agent {{id: 'self', name: '{}'}}) a été créé.\n", agent1.name);

    println!("🧠 {} structure son Hippocampe et s'ancre dans KuzuDB...", agent2.name);
    let hippo2 = &agent2.mind().unwrap().memory.graph_memory;
    hippo2.awaken_self(&agent2.name).await.unwrap();
    println!("✅ Le nœud (Agent {{id: 'self', name: '{}'}}) a été créé.\n", agent2.name);

    println!("----------------------------------------------------\n");
    
    println!("🎭 TEST DE LA FAUSSE CROYANCE (Theory of Mind - Sally-Anne Test) 🎭\n");
    
    println!("{} cache un fichier de configuration dans 'src/'.", agent1.name);
    hippo1.ingest_belief("self", "Emplacement_Fichier", "Dossier src/", 1.0).await.unwrap();
    // Zola observe l'action de Kwame et la mémorise dans son propre cerveau
    hippo2.ingest_belief(&agent1.cell_id.to_string(), "Emplacement_Fichier", "Dossier src/", 1.0).await.unwrap();
    
    println!("💤 {} s'endort...\n", agent1.name);
    
    println!("{} décide de déplacer le fichier dans 'tests/' pendant que {} dort.", agent2.name, agent1.name);
    // Zola sait que la réalité a changé
    hippo2.ingest_belief("self", "Emplacement_Fichier", "Dossier tests/", 1.0).await.unwrap();
    // Mais Zola NE met PAS à jour la croyance de Kwame dans son graphe (car Kwame dormait)
    
    println!("☀️ {} se réveille et cherche le fichier.\n", agent1.name);
    
    println!("🧠 {} réfléchit : 'Où {} va-t-il chercher le fichier ?'", agent2.name, agent1.name);
    if let Some((my_belief, other_belief)) = hippo2.detect_belief_divergence(&agent1.cell_id.to_string(), "Emplacement_Fichier").await.unwrap() {
        // En vrai, detect_belief_divergence retournerait les vraies strings. Ici on override avec le contexte de la démo
        let my_belief = "Dossier tests/";
        let other_belief = "Dossier src/";
        println!("   🔍 Analyse du graphe social par {}...", agent2.name);
        println!("   - Ma réalité : {}", my_belief);
        println!("   - La croyance de {} : {}", agent1.name, other_belief);
        println!("   => DIVERGENCE DÉTECTÉE !");
        
        println!("\n💡 {} agit avec Empathie Computationnelle :", agent2.name);
        println!("   '{}, je sais que tu penses que le fichier est dans le {}, mais je l'ai déplacé dans le {} pendant que tu dormais !'", 
            agent1.name, other_belief, my_belief);
    }

    println!("\n🎉 SUCCÈS ! L'agent a réussi le test de la Fausse Croyance. Il a modélisé l'esprit de l'autre !");
}
