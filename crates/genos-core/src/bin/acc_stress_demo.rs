#[tokio::main]
async fn main() {
    println!("=== GENOS V3 : SURVEILLANCE DE SES PROPRES LIMITES (ACC & STRESS) ===\n");

    let mut agent = genos_core::cell::AgentCell::default();
    agent.name = "Nia".to_string();
    agent.name_meaning = "Objectif (Swahili) - La détermination".to_string();

    println!("🌍 L'agent {} s'éveille face à un bug insoluble.\n", agent.name);
    
    let mind = agent.mind_mut().unwrap();
    let cog = &mut mind.cognition;

    println!("--- SCÉNARIO 1 : BOUCLE INFINIE (FIGHT) ---");
    println!("L'agent tente de compiler mais le code boucle. L'énergie est suffisante, mais l'erreur stagne.");
    for i in 1..=4 {
        println!("   Tentative {}...", i);
        cog.stress.consume_energy(2000, 500); // 2k tokens, 500ms
        cog.acc.monitor_conflict(2.0, 0.0); // Fort effort (2.0), aucun progrès (0.0)
    }
    
    let reaction = cog.autonomic_nervous_response();
    println!("   💡 Décision de l'agent : {:?}", reaction);
    
    println!("\n--- SCÉNARIO 2 : ÉPUISEMENT PROGRESSIF (FLIGHT) ---");
    // On relaxe un peu le conflit, mais on crame l'énergie
    cog.acc.cognitive_conflict_level = 0.0;
    println!("L'agent écrit un fichier géant (100k tokens). Le contexte sature, le stress monte à fond.");
    cog.stress.consume_energy(100_000, 45_000); // 100k tokens, 45 secondes
    cog.acc.monitor_conflict(1.0, 1.0); // Progrès réel, pas de conflit
    
    let reaction = cog.autonomic_nervous_response();
    println!("   💡 Décision de l'agent : {:?}", reaction);
    
    println!("\n--- SCÉNARIO 3 : LE MUR COGNITIF ABSOLU (FREEZE) ---");
    // On remet le conflit à bloc, et le stress est déjà quasi plein
    println!("L'agent est perdu dans le code legacy. Erreurs en boucle ET contexte saturé.");
    cog.stress.consume_energy(20_000, 10_000); // Consomme le reste
    cog.acc.monitor_conflict(5.0, -1.0); // L'erreur empire !
    
    let reaction = cog.autonomic_nervous_response();
    println!("   💡 Décision de l'agent : {:?}", reaction);

    println!("\n🎉 SUCCÈS : L'agent ne plante plus bêtement ! Il surveille ses limites (ACC), jauge sa fatigue (Stress), et adapte son comportement autonome (Fight/Flight/Freeze).");
}
