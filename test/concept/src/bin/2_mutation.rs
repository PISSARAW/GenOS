fn main() {
    println!("===============================================================");
    println!(" CONCEPT 2 : MUTATION (COMPARAISON DES AGENTS)");
    println!(" Tâche : Adaptation à un nouveau linter très strict qui rejette le code");
    println!("===============================================================\n");

    let context = "Le linter rejette systématiquement les fonctions de plus de 5 lignes et exige des types explicites partout.";

    // 1. Agent Simple
    println!("--- 1. AGENT SIMPLE ---");
    let prompt_simple = format!(
        "Tu es un assistant. Corrige le code suivant pour qu'il passe le linter.\nErreur du linter : {}\nCode : [Code de 10 lignes]", 
        context
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_simple);
    println!("> RÉSULTAT ATTENDU :");
    println!("L'agent s'excuse, modifie un peu le code, mais garde une fonction de 6 lignes. Le linter échoue à nouveau. L'agent boucle dans ses erreurs.\n");

    // 2. Agent Expert (avec RAG / Historique)
    println!("--- 2. AGENT EXPERT ---");
    let prompt_expert = format!(
        "Tu es un expert. Historique des erreurs précédentes : [Erreur 1, Erreur 2, Erreur 3].\nRègles du linter (RAG) : {}\nCorrige ce code sans répéter les erreurs.",
        context
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_expert);
    println!("> RÉSULTAT ATTENDU :");
    println!("Le prompt enfle démesurément. Le LLM consomme beaucoup de tokens d'historique. L'agent peut réussir, mais devient de plus en plus lent et confus par le surplus de contexte.\n");

    // 3. Worker GenOS (Demande de mutation)
    println!("--- 3. WORKER GENOS (Avant Mutation) ---");
    let genome_v1 = "{ syntax_strictness: 0.5 }";
    let prompt_worker_v1 = format!(
        "<system>Génome : {}</system>\nErreur du linter : {}",
        genome_v1, context
    );
    println!("> PROMPT ENVOYÉ (V1) :\n{}", prompt_worker_v1);
    println!("> ACTION DE L'AGENT : Au lieu de boucler, l'agent produit un outil interne `mutate_cognition(syntax_strictness=0.9)` car son stress monte.\n");
    
    println!("--- 3. WORKER GENOS (Après Mutation O(1)) ---");
    let genome_v2 = "{ syntax_strictness: 0.9, log: 'Mutated from 0.5 to pass strict linter' }";
    let prompt_worker_v2 = format!(
        "<system>Génome : {}</system>\nTâche : Écris le code.",
        genome_v2
    );
    println!("> PROMPT ENVOYÉ (V2) :\n{}", prompt_worker_v2);
    println!("> RÉSULTAT ATTENDU (Mécanique GenOS) :");
    println!("Le changement est structurel. Le prompt reste court (O(1)). L'agent, avec sa nouvelle nature (strictness=0.9), coupe organiquement les fonctions sans avoir besoin d'un historique lourd.\n");

    // 4. Orchestrateur GenOS
    println!("--- 4. ORCHESTRATEUR GENOS ---");
    let prompt_orchestrator = format!(
        "<system>Tu es l'Orchestrateur.</system>\nLe Worker_A a muté avec succès (syntax_strictness: 0.9) pour vaincre le linter. Il y a 3 autres tâches soumises au même linter. Que fais-tu ?"
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_orchestrator);
    println!("> RÉSULTAT ATTENDU (Mécanique de Swarm GenOS) :");
    println!("L'orchestrateur observe la mutation réussie (métadonnées) et clone ce nouveau génome V2 pour spawner de nouveaux workers. L'adaptation est systémique et immédiate.\n");
}
