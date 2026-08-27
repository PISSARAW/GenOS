fn main() {
    println!("===============================================================");
    println!(" CONCEPT 1 : GÉNÉTIQUE FONDAMENTALE (COMPARAISON DES AGENTS)");
    println!(" Tâche : Refactoring d'un composant critique de paiement");
    println!("===============================================================\n");

    let context =
        "Le composant gère les transactions bancaires. Il n'y a pas de tests unitaires complets.";

    // 1. Agent Simple
    println!("--- 1. AGENT SIMPLE ---");
    let prompt_simple = format!(
        "Tu es un assistant de codage.\nContexte : {}\nTâche : Refactorise ce composant pour le rendre plus propre.", 
        context
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_simple);
    println!("> RÉSULTAT ATTENDU (Mécanique Classique) :");
    println!("L'agent essaie de tout réécrire d'un coup. Il oublie les cas limites de sécurité et génère du code potentiellement cassé car il manque de directives.\n");

    // 2. Agent Expert
    println!("--- 2. AGENT EXPERT ---");
    let prompt_expert = format!(
        "Tu es un développeur Senior spécialisé en systèmes financiers.\nContexte : {}\nInstructions strictes :\n1. Ne change pas la logique métier.\n2. Ajoute des commentaires.\n3. Vérifie les failles.\nTâche : Refactorise le composant.",
        context
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_expert);
    println!("> RÉSULTAT ATTENDU (Mécanique Prompt Engineering) :");
    println!("L'agent réussit plutôt bien. MAIS si on relance ce même prompt un mois plus tard avec une mise à jour mineure du modèle LLM, son comportement sera différent. Pas de traçabilité stricte de sa 'personnalité'.\n");

    // 3. Worker GenOS
    println!("--- 3. WORKER GENOS ---");
    let genome_drives = "{ risk_tolerance: 0.05, syntax_strictness: 0.95 }";
    let prompt_worker = format!(
        "<system>\nTu es un GenOS Worker. Ton comportement est dicté STRICTEMENT par ton génome dynamique.\nGénome actuel (Valeurs exprimées) : {}\n</system>\nContexte : {}\nTâche : Refactorise le composant.",
        genome_drives, context
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_worker);
    println!("> RÉSULTAT ATTENDU (Mécanique GenOS) :");
    println!("À cause de son gène `risk_tolerance: 0.05`, le Worker GenOS refuse de modifier la logique sans exiger l'écriture préalable de tests unitaires. Son comportement est mathématiquement contraint par l'injection de son ADN dans le system prompt.\n");

    // 4. Orchestrateur GenOS
    println!("--- 4. ORCHESTRATEUR GENOS ---");
    let available_workers = "Worker_A (risk_tolerance: 0.8, exploration: 0.9), Worker_B (risk_tolerance: 0.05, syntax_strictness: 0.95)";
    let prompt_orchestrator = format!(
        "<system>\nTu es l'Orchestrateur GenOS. Ta mission est d'assigner la bonne tâche au bon Worker en fonction de leur génome.\nWorkers disponibles : {}\n</system>\nNouvelle Tâche : Refactoring d'un composant critique de paiement.\nLequel choisis-tu et pourquoi ?",
        available_workers
    );
    println!("> PROMPT ENVOYÉ :\n{}\n", prompt_orchestrator);
    println!("> RÉSULTAT ATTENDU (Mécanique de Swarm GenOS) :");
    println!("L'orchestrateur analyse l'ADN. Il écarte Worker_A (trop risqué, trop exploratoire) et assigne la tâche à Worker_B car la tâche exige une tolérance au risque quasi nulle. La délégation est industrielle et prédictible.\n");
}
