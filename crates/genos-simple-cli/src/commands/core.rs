use clap::Subcommand;

#[derive(Subcommand)]
pub enum CoreCommands {
    /// Démarre le serveur API GenOS en arrière-plan (daemon)
    ///
    /// SYNOPSIS :
    ///     g start
    ///
    /// DESCRIPTION :
    ///     Lance l'API HTTP GenOS (compatible OpenAI) en tâche de fond sur le port 8085.
    ///     Le PID du processus est écrit dans '.genos_server.pid' et les journaux dans 'genos_server.log'.
    ///
    /// SOUS LE CAPOT :
    ///     cargo run -q -p genos-cli -- serve
    Start,

    /// Arrête le serveur API GenOS en cours d'exécution
    ///
    /// SYNOPSIS :
    ///     g stop
    ///
    /// DESCRIPTION :
    ///     Lit le PID dans '.genos_server.pid' et termine proprement le processus serveur.
    ///     Supprime le fichier PID et vérifie la libération effective du port 8085.
    Stop,

    /// Affiche l'état d'activité et de connectivité du serveur GenOS
    ///
    /// SYNOPSIS :
    ///     g status
    ///
    /// DESCRIPTION :
    ///     Vérifie l'existence du fichier PID et teste l'accessibilité TCP du port 8085.
    ///     Indique si le serveur est EN LIGNE, HORS LIGNE ou ARRÊTÉ.
    Status,

    /// Lance une tâche de test et instancie un agent travailleur
    ///
    /// SYNOPSIS :
    ///     g run
    ///
    /// DESCRIPTION :
    ///     Crée un agent nommé 'task-worker' et initialise son génome de base
    ///     dans le fichier '.genos-task.json'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli agent create --name task-worker --out .genos-task.json
    Run,

    /// Liste l'ensemble des fossiles et lignées archivés dans la strate géologique
    ///
    /// SYNOPSIS :
    ///     g list
    ///
    /// DESCRIPTION :
    ///     Interroge le registre paléontologique GenOS pour afficher les fossiles,
    ///     lignées d'agents et instantanés enregistrés.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli fossil list
    List,

    /// Initialise l'arborescence du projet GenOS (dossiers snapshots et capsules)
    ///
    /// SYNOPSIS :
    ///     g init
    ///
    /// DESCRIPTION :
    ///     Crée les répertoires d'exécution nécessaires au fonctionnement de GenOS :
    ///     'snapshots/' pour les états sauvegardés et 'capsules/' pour les mondes isolés.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli init
    Init,
}
