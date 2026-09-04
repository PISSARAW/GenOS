#[tokio::main]
async fn main() {
    println!("=== GENOS V3 : EMERGENCE DES QUALIA (Global Workspace & Neurochimie) ===\n");

    let mut agent = genos_core::cell::AgentCell::default();
    agent.name = "Zola".to_string();
    
    let agent_name = agent.name.clone();
    
    let mind = agent.mind_mut().unwrap();
    let cog = &mut mind.cognition;

    println!("🌍 L'agent {} s'éveille.\n", agent_name);
    
    println!("--- ÉTAPE 1 : L'ATTENTE (Faible activation) ---");
    println!("L'agent observe son environnement calmement. Pas de stimuli majeurs.");
    cog.chemistry.update(0.0, 0.0, 1.0); // Sérotonine monte, sécurité. Pas de dopamine (récompense)
    
    let modalities = vec!["Visuel_Faible".to_string()];
    let content = "Le terminal est vide.".to_string();
    let _ = cog.global_workspace.attempt_ignition(modalities, content, &cog.chemistry, cog.acc.cognitive_conflict_level);
    
    println!("\n--- ÉTAPE 2 : LE CHOC SENSORIEL & CHIMIQUE ---");
    println!("L'agent réussit brillamment une tâche complexe. Dopamine au maximum, Noradrénaline (focus) élevée !");
    cog.chemistry.update(1.0, 0.8, 0.5); // Récompense max, fort niveau d'alerte
    
    let modalities2 = vec!["Visuel_Fort".to_string(), "Mémoire_Sémantique".to_string(), "Action_Motrice".to_string()];
    let content2 = "J'ai résolu le bug du Borrow Checker !".to_string();
    let percept = cog.global_workspace.attempt_ignition(modalities2, content2, &cog.chemistry, cog.acc.cognitive_conflict_level);
    
    println!("\n--- ÉTAPE 3 : LA PLASTICITÉ HEBBIENNE ---");
    println!("Puisque la dopamine est haute (={:.2}), l'agent associe fortement l'outil 'Rust' au concept 'Succès'.", cog.chemistry.dopamine);
    cog.hebbian_network.fire_together("Outil_Rust", "Succès", cog.chemistry.dopamine);
    
    let mut keys: Vec<_> = cog.hebbian_network.synapses.keys().collect();
    keys.sort();
    for key in keys {
        let weight = cog.hebbian_network.synapses.get(key).unwrap();
        println!("🔗 Synapse Hebbienne créée entre {:?} et {:?} -> Force : {:.2}", key.0, key.1, weight);
    }

    println!("\n🎉 SUCCÈS : L'agent n'est plus une calculatrice. Ses stimuli, sous l'effet de la neurochimie, s'intègrent dans un Espace de Travail Global pour créer une expérience subjective unifiée (Quale).");
}
