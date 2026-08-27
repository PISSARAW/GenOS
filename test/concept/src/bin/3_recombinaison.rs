fn main() {
    println!("===============================================================");
    println!(" CONCEPT 3 : RECOMBINAISON & REPRODUCTION (COMPARAISON)");
    println!(" Tâche : Créer un agent capable d'écrire un algorithme complexe ET sécurisé");
    println!("===============================================================\n");

    // 1. Agent Simple
    println!("--- 1. AGENT SIMPLE ---");
    let prompt_simple = "Tu es un assistant. Écris un algorithme de tri très performant ET assure-toi qu'il n'y a aucune faille de sécurité d'accès mémoire.";
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_simple);
    println!("> RÉSULTAT ATTENDU :");
    println!("L'agent utilise un seul LLM avec un gros prompt réunissant tout. Souvent, la sécurité est oubliée au profit de la performance, ou inversement (Dilution de l'attention).\n");

    // 2. Agents Experts (Swarm Classique)
    println!("--- 2. AGENTS EXPERTS (Multi-agents classique) ---");
    let prompt_expert1 = "Tu es l'Expert Algo. Écris le tri.";
    let prompt_expert2 = "Tu es l'Expert Sécurité. Critique le code de l'Expert Algo.";
    println!(
        "> PROMPTS ENVOYÉS :\n1. {}\n2. {}\n",
        prompt_expert1, prompt_expert2
    );
    println!("> RÉSULTAT ATTENDU :");
    println!("L'architecture multi-agents force les deux LLMs à discuter. Cela génère des allers-retours très coûteux en tokens et très lents.\n");

    // 3. Worker GenOS
    println!("--- 3. WORKER GENOS (Inapplicable directement) ---");
    println!("Le Worker est l'individu. Il ne se combine pas tout seul, c'est l'Orchestrateur qui gère la reproduction.\n");

    // 4. Orchestrateur GenOS
    println!("--- 4. ORCHESTRATEUR GENOS (Reproduction) ---");
    let prompt_orchestrator = format!(
        "<system>Tu es l'Orchestrateur GenOS.</system>\nWorker_A (Génome: Expert Sécurité) a brillé sur la tâche X.\nWorker_B (Génome: Expert Algo) a brillé sur la tâche Y.\nLa tâche Z nécessite les deux compétences. Lancer `breed_genomes(A, B)` ?"
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_orchestrator);
    println!("> RÉSULTAT ATTENDU (Mécanique GenOS) :");
    println!("L'orchestrateur exécute la recombinaison (Méiose). Le backend crée mathématiquement l'Enfant_C (Hybride).");
    println!(
        "Enfant_C hérite de : {{ syntax_strictness: 0.9 (de A), exploration_drive: 0.9 (de B) }}."
    );
    println!("Ensuite, l'Orchestrateur déploie UN SEUL agent (l'Enfant_C) avec ce nouveau génome.\nLe coût en tokens est divisé par deux comparé au swarm classique, sans perte d'expertise.\n");
}
