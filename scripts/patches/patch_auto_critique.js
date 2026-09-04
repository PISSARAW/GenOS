const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/bin/genos.rs', 'utf8');

file = file.replace(
`        if is_ready {
            println!("✅ L'agent a validé que le produit est fini ! Sortie de boucle.");
            break;
        } else {
            println!("🔄 L'agent continue. Injection du retour positif...");
            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "user".to_string(),
                    content: "Code validé et sauvegardé dans le VFS. Le projet n'est pas encore complet. Continue de générer la suite des fichiers. N'oublie pas le tag [READY] à la fin uniquement quand le projet est fini de bout en bout.".to_string(),
                }
            );
        }`,
`        if code_response.contains("[APPROVED]") {
            println!("🥇 [Auto-Critique] L'agent a revu et certifié le projet sans bug ! Sortie de boucle définitive.");
            break;
        } else if is_ready {
            println!("🔍 L'agent pense avoir fini. Déclenchement de l'Auto-Critique (Code Review) !");
            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "user".to_string(),
                    content: "Tu as déclaré [READY] et le code a passé la Sandbox. Mais en tant qu'IA experte, tu dois valider ton travail.\nEffectue une AUTO-CRITIQUE (Code Review) rigoureuse de tout ce que tu viens d'écrire. Cherche les failles, bugs d'UX, responsabilités manquantes, ou design médiocre.\nSi le code est absolument parfait et prêt pour la production, réponds EXACTEMENT et UNIQUEMENT le token \`[APPROVED]\`.\nS'il y a le moindre défaut, écris les correctifs nécessaires avec \`FILE:\` et termine par \`[READY]\` à nouveau.".to_string(),
                }
            );
        } else {
            println!("🔄 L'agent continue. Injection du retour positif...");
            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "user".to_string(),
                    content: "Code validé et sauvegardé dans le VFS. Le projet n'est pas encore complet. Continue de générer la suite des fichiers. N'oublie pas le tag [READY] à la fin uniquement quand le projet est fini de bout en bout.".to_string(),
                }
            );
        }`
);

fs.writeFileSync('crates/genos-core/src/bin/genos.rs', file);
