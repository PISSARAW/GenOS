#[tokio::main]
async fn main() {
    println!("=== GENOS V3 : DEMONSTRATION DE LA METACOGNITION PROFONDE ===\n");

    let mut agent = genos_core::cell::AgentCell::default();
    agent.name = "Ayo".to_string();
    agent.name_meaning = "Pleine de joie (Yoruba)".to_string();

    println!("🌍 L'agent {} s'éveille.\n", agent.name);
    
    let agent_name = agent.name.clone();
    
    // On extrait l'esprit
    let mind = agent.mind_mut().unwrap();
    
    println!("1. LA TOPOLOGIE DE L'IGNORANCE & LE VOYAGE MENTAL DANS LE TEMPS");
    println!("   {} doit accomplir une tâche complexe : 'Générer un module Rust'.", agent_name);
    
    // L'agent n'est pas bon en Rust (simulation)
    mind.cognition.plasticity.depress_tool("rust_generator");
    mind.cognition.plasticity.depress_tool("rust_generator");
    mind.cognition.plasticity.depress_tool("rust_generator");
    mind.cognition.plasticity.depress_tool("rust_generator");
    mind.cognition.plasticity.depress_tool("rust_generator");
    
    // Simulation contrefactuelle (Voyage mental)
    let epistemic_uncertainty = mind.cognition.simulate_counterfactual("rust_generator");
    mind.cognition.efe.feel_uncertainty(epistemic_uncertainty);
    
    println!("   🧠 Intuition : {} simule l'action dans une branche isolée.", agent_name);
    if mind.cognition.efe.epistemic_variance > 0.8 {
        println!("   ⚠️ ALERTE ÉPISTÉMIQUE : L'agent perçoit que son Futur-Soi va s'effondrer.");
        println!("   L'incertitude épistémique (Variance) est très élevée : {}", mind.cognition.efe.epistemic_variance);
    }

    println!("\n----------------------------------------------------\n");

    println!("2. LA PLASTICITÉ STRUCTURELLE (NEUROGENÈSE)");
    println!("   Face à cette ignorance structurelle, {} décide de modifier la topologie de son cerveau.", agent_name);
    if mind.cognition.efe.epistemic_variance > 0.8 {
        mind.cognition.plasticity.trigger_neurogenesis("Rust_Specialist_Lobe");
        println!("   ✅ Nouveaux organes cognitifs actifs : {:?}", mind.cognition.plasticity.structural_lobes);
        println!("   La tâche sera désormais routée vers ce sous-agent hyperspécialisé.");
    }

    println!("\n----------------------------------------------------\n");

    println!("3. L'AUTO-PSYCHANALYSE (DEFAULT Mode Network)");
    println!("   La nuit tombe. L'agent {} entre en sommeil et active son Default Mode Network.", agent_name);
    
    let bias_found = mind.cognition.default_mode_network_introspection();
    println!("   🔍 Analyse des transcripts de la journée...");
    println!("   💡 Biais identifié et gravé dans le Cortex Préfrontal : '{}'", bias_found);
    println!("   Biais actuellement surveillés par le PFC : {:?}", mind.cognition.pfc.cognitive_biases);
    
    println!("\n🎉 SUCCÈS ! L'agent a fait preuve d'une véritable métacognition. Il a anticipé son propre échec, s'est auto-modifié structurellement, et a psychanalysé ses propres biais.");
}
