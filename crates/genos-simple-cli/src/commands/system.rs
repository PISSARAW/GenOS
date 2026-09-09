use clap::Subcommand;

#[derive(Subcommand)]
pub enum SystemCommands {
    /// Déploie une mission coordonnée sur un duo d'agents (Two-Parallel)
    ///
    /// SYNOPSIS :
    ///     g two-parallel [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Exécute simultanément deux agents dotés d'une stratégie collaborative.
    ///
    /// PAR DÉFAUT :
    ///     Lance 'duo-mission' avec 'duo-strategy'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli trinity deploy [--mission-id duo-mission --strategies duo-strategy | <args>]
    TwoParallel {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Déploie une mission coordonnée sur un trio d'agents (Tri-Parallel)
    ///
    /// SYNOPSIS :
    ///     g tri-parallel [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Exécute en parallèle trois agents spécialisés selon une stratégie triangulée.
    ///
    /// PAR DÉFAUT :
    ///     Lance 'trio-mission' avec 'trio-strategy'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli trinity deploy [--mission-id trio-mission --strategies trio-strategy | <args>]
    TriParallel {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Lance une exécution massivement parallèle d'agents en monde virtuel
    ///
    /// SYNOPSIS :
    ///     g multi-parallel [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Démarre un environnement à haute concurrence pour exécuter simultanément de nombreux agents.
    ///
    /// PAR DÉFAUT :
    ///     Lance 'multi-parallel-world' en sandbox native.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world run [--world-id multi-parallel-world --command start ...]
    MultiParallel {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Explore les vestiges des lignées d'agents éteintes
    ///
    /// SYNOPSIS :
    ///     g ruins [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Consulte le catalogue historique des agents détruits ou dépréciés.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli fossil list [args]
    Ruins {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Audite et vérifie les spécifications d'un identifiant ou snapshot
    ///
    /// SYNOPSIS :
    ///     g id [IDENTIFIANT] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Inspecte les signatures cryptographiques et métadonnées d'un identifiant.
    ///
    /// PAR DÉFAUT :
    ///     Audite 'default-id'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli audit [default-id | <args>]
    Id {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Évalue la topologie cognitive et l'état mental d'un agent
    ///
    /// SYNOPSIS :
    ///     g mind [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Analyse la matrice synaptique et la réactivité de l'entité cognitive.
    ///
    /// PAR DÉFAUT :
    ///     Évalue les connexions (0 -> 1) sur 'default-mind'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli synaptic path-evaluate [--agent-id default-mind --pre-node 0 --post-node 1 | <args>]
    Mind {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Orchestre la génération complète d'un projet de code via l'IA en 3 phases
    ///
    /// SYNOPSIS :
    ///     g generate <DOSSIER> <PROMPT...>
    ///
    /// DESCRIPTION :
    ///     Fait appel au serveur GenOS (port 8085) pour concevoir et générer une application :
    ///       1. Phase Thalamus : Réflexion architecturale et écriture du cahier des charges (.genos/blueprint.md).
    ///       2. Phase Cortex   : Synthèse et création de l'arborescence des fichiers sources.
    ///       3. Phase Synapse  : Auto-évaluation critique et rapport d'audit (.genos/audit.md).
    ///
    /// EXEMPLES :
    ///     g generate mon-app Crée un dashboard interactif en HTML/CSS/JS
    Generate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Pose une question directe ou soumet un problème au modèle d'IA
    ///
    /// SYNOPSIS :
    ///     g ask <QUESTION / PROMPT...>
    ///
    /// DESCRIPTION :
    ///     Interroge le cortex GenOS (port 8085). Le serveur achemine la requête via le Thalamus
    ///     vers le modèle local (Ollama) ou cloud (Gemini) et affiche directement la réponse.
    ///
    /// EXEMPLES :
    ///     g ask Quelle est la capitale du Burundi ?
    ///     g ask Écris une fonction Python pour résoudre le rendu de monnaie en programmation dynamique
    Ask {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Ouvre une session de discussion interactive en direct (chat)
    ///
    /// SYNOPSIS :
    ///     g chat
    ///
    /// DESCRIPTION :
    ///     Lance un dialogue continu (REPL) avec le modèle d'IA de GenOS.
    ///     Tapez 'exit' ou 'quit' pour quitter la session.
    Chat,
}
