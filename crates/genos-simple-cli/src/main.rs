use clap::{Parser, Subcommand};

fn exit_on_command_failure(status: std::io::Result<std::process::ExitStatus>) {
    match status {
        Ok(status) if status.success() => {}
        Ok(status) => std::process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("Échec de l'exécution de la commande: {}", error);
            std::process::exit(1);
        }
    }
}

fn command_error(message: impl std::fmt::Display) -> ! {
    eprintln!("Erreur: {}", message);
    std::process::exit(1);
}

#[derive(Parser)]
#[command(
    name = "g",
    about = "GenOS Simple CLI - Interface unifiée pour l'écosystème biomimétique GenOS",
    version = "1.0",
    after_help = "MANUEL D'UTILISATION :
  Tapez `g <COMMANDE> --help` pour consulter le manuel détaillé (SYNOPSIS, DESCRIPTION, EXEMPLES).
  Les commandes relayent automatiquement leurs arguments vers le moteur natif `genos-cli`.
  L'option globale `--yes` est requise pour confirmer les opérations destructrices (destroy, wipe, close, keep)."
)]
struct Cli {
    #[arg(long, global = true, help = "Confirmer une opération ayant des effets secondaires destructeurs")]
    yes: bool,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
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

    /// Rejoue l'historique d'exécution d'un agent depuis un snapshot
    ///
    /// SYNOPSIS :
    ///     g replay [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Rejoue pas à pas les décisions et actions d'un agent pour reproduire un comportement
    ///     ou analyser une divergence dans un environnement sandboxé.
    ///
    /// PAR DÉFAUT :
    ///     Exécute le replay basique sur 'latest-snapshot'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli replay basic [--snapshot latest-snapshot | <args>]
    Replay {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Compare deux snapshots ou états pour quantifier la divergence
    ///
    /// SYNOPSIS :
    ///     g diff [SNAPSHOT_A] [SNAPSHOT_B] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Calcule le différentiel précis (génome, mémoire, phénotype) entre deux points d'arrêt.
    ///
    /// PAR DÉFAUT :
    ///     Compare les snapshots 'origin' et 'latest'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli diff [origin latest | <args>]
    Diff {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Analyse et isole la source d'une hallucination ou dérive cognitive
    ///
    /// SYNOPSIS :
    ///     g blame [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Inspecte l'état cognitif et les traces d'inférence d'un snapshot pour identifier
    ///     le stimulus ou la défaillance à l'origine d'une hallucination.
    ///
    /// PAR DÉFAUT :
    ///     Analyse 'latest-snapshot'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli hallucination analyze [--snapshot latest-snapshot | <args>]
    Blame {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Retrace le graphe de causalité d'une exécution ou d'un incident
    ///
    /// SYNOPSIS :
    ///     g trace [FICHIER_LOG] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Reconstitue le graphe causal des actions et stimuli ayant mené à un incident.
    ///
    /// PAR DÉFAUT :
    ///     Utilise 'default-trace.log'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli experiment causal-replay [default-trace.log | <args>]
    Trace {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Clone un agent par bifurcation (fork) génétique
    ///
    /// SYNOPSIS :
    ///     g clone [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Duplique l'ADN et les poids synaptiques d'un agent parent pour créer une lignée fille.
    ///
    /// PAR DÉFAUT :
    ///     Clone l'agent 'default-parent'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli agent fork [--parent-id default-parent | <args>]
    Clone {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Applique une mutation ciblée sur un trait génétique d'un agent
    ///
    /// SYNOPSIS :
    ///     g mutate [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Modifie artificiellement un allèle ou un trait comportemental pour explorer
    ///     de nouvelles adaptations ou stratégies.
    ///
    /// PAR DÉFAUT :
    ///     Mute le trait 'creativity' sur 'default-agent'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli agent mutate [--agent-id default-agent --trait creativity | <args>]
    Mutate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Adapte la stratégie cognitive de l'agent face à des contraintes
    ///
    /// SYNOPSIS :
    ///     g elevate [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Ajuste les hyper-politiques de l'agent pour satisfaire des contraintes de temps ou de ressources.
    ///
    /// PAR DÉFAUT :
    ///     Adapte 'default-agent' sous contrainte 'time' avec cible 1.0.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli strategy adapt [--agent-id default-agent --constraint time --target 1.0 | <args>]
    Elevate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Met l'agent en repos biologique (cryptobiose) pour préserver ses ressources
    ///
    /// SYNOPSIS :
    ///     g rest [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Suspend l'activité métabolique et cognitive d'un agent tout en garantissant
    ///     son intégrité pour une reprise ultérieure.
    ///
    /// PAR DÉFAUT :
    ///     Suspend 'default-agent'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli resilience cryptobiosis [--agent-id default-agent | <args>]
    Rest {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Vérifie et audite l'intégrité d'un snapshot
    ///
    /// SYNOPSIS :
    ///     g check [SNAPSHOT] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Effectue un audit complet des structures de données, invariants de sécurité
    ///     et de la cohérence interne du snapshot.
    ///
    /// PAR DÉFAUT :
    ///     Audite 'latest-snapshot'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli audit [latest-snapshot | <args>]
    Check {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Mesure la divergence phénotypique d'un trait face à une référence
    ///
    /// SYNOPSIS :
    ///     g compare [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Évalue si les manifestations observables de l'agent respectent les tolérances définies.
    ///
    /// PAR DÉFAUT :
    ///     Mesure 'default-trait' (attendu: 1.0, observé: 0.9, tolérance: 0.2).
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli phenotype measure-divergence [...]
    Compare {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Analyse un incident à partir d'un manifeste d'anomalie
    ///
    /// SYNOPSIS :
    ///     g retrace [MANIFEST] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Remonte la chaîne d'événements à l'origine d'un échec documenté dans un fichier manifeste.
    ///
    /// PAR DÉFAUT :
    ///     Utilise 'default-manifest.json'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli experiment incident [default-manifest.json | <args>]
    Retrace {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Restaure une capsule d'exécution isolée depuis un snapshot
    ///
    /// SYNOPSIS :
    ///     g restore [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Recrée un environnement d'exécution complet (capsule) à l'état exact du snapshot spécifié.
    ///
    /// PAR DÉFAUT :
    ///     Crée une capsule depuis 'latest-snapshot'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli capsule create [--snapshot latest-snapshot | <args>]
    Restore {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Récupère l'état opérationnel d'un agent après crash via replay causal
    ///
    /// SYNOPSIS :
    ///     g recover [FICHIER_LOG] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Rejoue le journal causal pour ramener l'agent au dernier état stable sans corruption.
    ///
    /// PAR DÉFAUT :
    ///     Utilise 'default-recovery.log'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli experiment causal-replay [default-recovery.log | <args>]
    Recover {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Interroge la base de connaissances et mémoire vectorielle (RAG)
    ///
    /// SYNOPSIS :
    ///     g retrieve [REQUÊTE] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Recherche les documents et fragments d'informations pertinents dans l'index de la plateforme.
    ///
    /// PAR DÉFAUT :
    ///     Recherche 'default query'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli platform search ["default query" | <args>]
    Retrieve {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Détecte et interrompt les boucles de raisonnement infinies ou stagnantes
    ///
    /// SYNOPSIS :
    ///     g filter [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Analyse l'historique d'un agent pour identifier et bloquer les répétitions cycliques improductives.
    ///
    /// PAR DÉFAUT :
    ///     Analyse le fichier 'history.log'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli loop-detection [--history-file history.log | <args>]
    Filter {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Fusionne les modifications d'une capsule ou branche dans le tronc principal
    ///
    /// SYNOPSIS :
    ///     g merge [BRANCHE] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Applique les modifications validées issues d'une capsule isolée après vérification d'intégrité.
    ///
    /// PAR DÉFAUT :
    ///     Fusionne 'default-branch'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli merge [default-branch | <args>]
    Merge {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Analyse la diversité génétique et les allèles d'un essaim (Swarm)
    ///
    /// SYNOPSIS :
    ///     g parent [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Cartographie la généalogie et la distribution des allèles parmi les membres d'un essaim.
    ///
    /// PAR DÉFAUT :
    ///     Analyse l'essaim 'default-swarm'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli swarm allele-analyzer [--swarm-id default-swarm | <args>]
    Parent {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Affiche la généalogie complète et l'historique des strates de fossiles
    ///
    /// SYNOPSIS :
    ///     g lineage [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Permet de naviguer dans l'évolution historique des agents et lignées passées.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli fossil list [args]
    Lineage {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Condense et élague le réseau neuronal de l'agent (Pruning)
    ///
    /// SYNOPSIS :
    ///     g squeeze [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Supprime les connexions synaptiques dont le poids est inférieur au seuil spécifié.
    ///
    /// PAR DÉFAUT :
    ///     Élague 'default-agent' avec un seuil de 0.5.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli agent prune [--agent-id default-agent --threshold 0.5 | <args>]
    #[command(alias = "squeaze")]
    Squeeze {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Évalue l'intensité et le cheminement du flux synaptique entre deux nœuds
    ///
    /// SYNOPSIS :
    ///     g think [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Mesure la propagation du signal à travers le réseau de pensée de l'agent.
    ///
    /// PAR DÉFAUT :
    ///     Évalue le chemin de 'input' à 'output' sur 'default-agent'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli synaptic path-evaluate [--agent-id default-agent --pre-node input --post-node output | <args>]
    Think {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Déploie une mission collaborative sur trois agents coordonnés (Trinity)
    ///
    /// SYNOPSIS :
    ///     g trio [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Instancie trois agents aux rôles complémentaires pour résoudre une mission complexe.
    ///
    /// PAR DÉFAUT :
    ///     Déploie 'mission-alpha' avec la stratégie 'trio-default'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli trinity deploy [--mission-id mission-alpha --strategies trio-default | <args>]
    Trio {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Lance l'exécution d'un environnement multi-agents isolé (World Run)
    ///
    /// SYNOPSIS :
    ///     g multi [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Exécute une simulation globale hébergeant plusieurs entités dans un monde virtuel dédié.
    ///
    /// PAR DÉFAUT :
    ///     Lance './multi-world' avec le monde 'default-multi' en sandbox native.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world run [--provider local --root ./multi-world --world-id default-multi ...]
    Multi {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Ingère et indexe un document dans la base de connaissances (Platform Ingest)
    ///
    /// SYNOPSIS :
    ///     g broad [FICHIER] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Découpe, vectorise et intègre le contenu d'un document dans la mémoire partagée.
    ///
    /// PAR DÉFAUT :
    ///     Ingère './README.md'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli platform ingest [./README.md | <args>]
    Broad {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Supervise et analyse la dynamique globale d'un essaim d'agents (Swarm)
    ///
    /// SYNOPSIS :
    ///     g swarm [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Inspecte l'état, les interactions et la performance collective d'un essaim.
    ///
    /// PAR DÉFAUT :
    ///     Analyse l'essaim 'alpha-swarm'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli swarm [allele-analyzer --swarm-id alpha-swarm | <args>]
    Swarm {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Lance une investigation systématique d'anomalie (Bug Investigation)
    ///
    /// SYNOPSIS :
    ///     g debug [MANIFEST] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Exécute une suite de diagnostics contrefactuels pour localiser un bug répertorié.
    ///
    /// PAR DÉFAUT :
    ///     Utilise 'default-manifest.json'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli experiment bug-investigation [default-manifest.json | <args>]
    Debug {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Déclare l'extinction irréversible et archive une lignée (requiert --yes)
    ///
    /// SYNOPSIS :
    ///     g destroy --yes [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Enregistre l'extinction définitive d'une lignée dans le registre fossile et libère ses ressources.
    ///     Cette action destructrice nécessite obligatoirement l'option globale '--yes'.
    ///
    /// PAR DÉFAUT :
    ///     Archive l'extinction de 'default-lineage' pour motif 'destroyed_by_user'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli fossil record [--lineage-id default-lineage --reason destroyed_by_user | <args>]
    Destroy {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Arrête et décharge un monde virtuel en cours d'exécution (requiert --yes)
    ///
    /// SYNOPSIS :
    ///     g close --yes [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Ferme les instances d'agents et démonte l'environnement de bac à sable du monde spécifié.
    ///     Nécessite le drapeau '--yes' pour confirmer l'arrêt.
    ///
    /// PAR DÉFAUT :
    ///     Arrête le monde 'default'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world run [--provider local --root ./ --world-id default --command stop ...]
    Close {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Génère un rapport d'audit et de conformité réglementaire (ex: ISO GenOS)
    ///
    /// SYNOPSIS :
    ///     g order [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Vérifie l'alignement des opérations et des agents avec les politiques normatives.
    ///
    /// PAR DÉFAUT :
    ///     Génère le rapport pour le standard 'iso-genos-1'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli compliance generate [--standard iso-genos-1 | <args>]
    Order {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Déploie une mission collaborative Trinity en mode autonome
    ///
    /// SYNOPSIS :
    ///     g auto [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Initialise un trio d'agents dotés de protocoles de résolution automatique sans supervision continue.
    ///
    /// PAR DÉFAUT :
    ///     Lance 'auto-mission' avec la stratégie 'autonomous'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli trinity deploy [--mission-id auto-mission --strategies autonomous | <args>]
    Auto {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Optimise la stratégie de l'agent pour une vitesse d'exécution maximale
    ///
    /// SYNOPSIS :
    ///     g fast [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Règle la contrainte temporelle de l'agent à une valeur minimale (0.1) pour privilégier la rapidité.
    ///
    /// PAR DÉFAUT :
    ///     Adapte 'default-agent' sous contrainte 'time' avec cible 0.1.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli strategy adapt [--agent-id default-agent --constraint time --target 0.1 | <args>]
    Fast {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Sauvegarde l'état complet d'un agent sous forme d'instantané (Snapshot)
    ///
    /// SYNOPSIS :
    ///     g copy [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Enregistre la mémoire, les paramètres et l'arborescence cognitive d'un agent dans un fichier JSON.
    ///
    /// PAR DÉFAUT :
    ///     Copie 'default-agent' vers 'snapshot_copy.json'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli snapshot create [--agent default-agent --out snapshot_copy.json | <args>]
    Copy {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Crée un hub racine partagé pour héberger des mondes virtuels
    ///
    /// SYNOPSIS :
    ///     g hub [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Initialise la structure d'accueil locale permettant d'orchestrer plusieurs mondes et agents.
    ///
    /// PAR DÉFAUT :
    ///     Crée le hub 'hub-01' dans './hub'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world create [--provider local --root ./hub --world-id hub-01 | <args>]
    Hub {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Recherche transversale de sagesses et retours d'expérience dans la plateforme
    ///
    /// SYNOPSIS :
    ///     g wisdom [REQUÊTE] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Extrait les enseignements et heuristiques mémorisés lors des exécutions antérieures.
    ///
    /// PAR DÉFAUT :
    ///     Recherche le terme 'wisdom' dans l'index.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli platform search ["wisdom" | <args>]
    Wisdom {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Inspecte et évalue la connectivité synaptique de base de l'agent
    ///
    /// SYNOPSIS :
    ///     g synapse [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Vérifie le passage du signal entre les nœuds neuronaux fondamentaux (0 -> 1).
    ///
    /// PAR DÉFAUT :
    ///     Évalue les nœuds 0 et 1 sur 'default-agent'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli synaptic path-evaluate [--agent-id default-agent --pre-node 0 --post-node 1 | <args>]
    Synapse {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Élague drastiquement les connexions synaptiques de l'agent (requiert --yes)
    ///
    /// SYNOPSIS :
    ///     g wipe --yes [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Applique un élagage extrême (seuil 0.99) pour remettre à nu le réseau neuronal.
    ///     Opération destructrice soumise au drapeau '--yes'.
    ///
    /// PAR DÉFAUT :
    ///     Élague 'default-agent' avec un seuil de 0.99.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli agent prune [--agent-id default-agent --threshold 0.99 | <args>]
    Wipe {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Démarre une session d'exploitation active au sein d'un monde
    ///
    /// SYNOPSIS :
    ///     g operate [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Lance l'orchestration des agents dans le hub d'exécution désigné.
    ///
    /// PAR DÉFAUT :
    ///     Opère sur le monde 'hub-01' avec la commande 'operate'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world run [--provider local --root ./ --world-id hub-01 --command operate ...]
    Operate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Isole et extrait les segments hallucinatoires d'un snapshot
    ///
    /// SYNOPSIS :
    ///     g dissect [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Extrait les traces de raisonnement ayant dérivé pour les analyser de manière isolée.
    ///
    /// PAR DÉFAUT :
    ///     Dissèque 'latest-snapshot'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli hallucination extract [--snapshot latest-snapshot | <args>]
    Dissect {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Détecte les hallucinations latentes ou invisibles dans un snapshot
    ///
    /// SYNOPSIS :
    ///     g unveil [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Scanne en profondeur les incohérences sémantiques ou factuelles au sein du snapshot.
    ///
    /// PAR DÉFAUT :
    ///     Détecte sur 'latest-snapshot'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli hallucination detect [--snapshot latest-snapshot | <args>]
    Unveil {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Bifurque l'arbre de causalité depuis la racine (Causality Fork)
    ///
    /// SYNOPSIS :
    ///     g root [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Crée une nouvelle frontière causale indépendante à partir d'un nœud racine.
    ///
    /// PAR DÉFAUT :
    ///     Bifurque de 'root-boundary' vers 'new-branch'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli causality fork [--boundary-id root-boundary --new-boundary-id new-branch | <args>]
    Root {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Conserve et intègre définitivement la branche courante (requiert --yes)
    ///
    /// SYNOPSIS :
    ///     g keep --yes [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Valide et fusionne la branche active en consolidant son historique.
    ///     Action engageante nécessitant le drapeau '--yes'.
    ///
    /// PAR DÉFAUT :
    ///     Fusionne 'current-branch'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli merge [current-branch | <args>]
    Keep {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Exécute un monde virtuel avec le bac à sable à isolation quantique
    ///
    /// SYNOPSIS :
    ///     g quantum [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Lance l'exécution sous l'environnement sandbox 'quantum' à étanchéité renforcée.
    ///
    /// PAR DÉFAUT :
    ///     Démarre 'quantum-world' avec le backend de sandbox quantique.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world run [--sandbox-backend quantum ...]
    Quantum {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Consulte le catalogue des instantanés (snapshots) sauvegardés
    ///
    /// SYNOPSIS :
    ///     g store [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Affiche la liste des instantanés disponibles dans le répertoire de stockage.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli snapshot list [args]
    Store {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Ajuste précisément l'échelle d'élagage d'un fragment synaptique
    ///
    /// SYNOPSIS :
    ///     g piece [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Module l'intensité synaptique globale d'un agent selon un ratio d'échelle.
    ///
    /// PAR DÉFAUT :
    ///     Applique une échelle de 0.8 sur 'default-agent'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli synaptic prune-scale [--agent-id default-agent --scale 0.8 | <args>]
    Piece {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Lance le serveur API GenOS au premier plan (mode interactif)
    ///
    /// SYNOPSIS :
    ///     g daemon [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Démarre le serveur API directement dans la console courante pour faciliter le débogage.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli serve [args]
    Daemon {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Instancie l'agent autonome générique 'pre-agi-core'
    ///
    /// SYNOPSIS :
    ///     g preagi [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Crée une entité autonome de niveau supérieur et enregistre son état initial.
    ///
    /// PAR DÉFAUT :
    ///     Crée l'agent 'pre-agi-core' vers 'preagi-snapshot.json'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli agent create [--name pre-agi-core --out preagi-snapshot.json | <args>]
    Preagi {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Démarre une simulation sociétale multi-agents à grande échelle
    ///
    /// SYNOPSIS :
    ///     g civilization [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Initialise et exécute un écosystème complexe d'agents en interaction continue.
    ///
    /// PAR DÉFAUT :
    ///     Démarre le monde 'civilization-alpha'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli world run [--world-id civilization-alpha --command start ...]
    Civilization {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Explore en profondeur les strates et vestiges paléontologiques
    ///
    /// SYNOPSIS :
    ///     g explore [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Parcourt l'inventaire historique des fossiles et artefacts enregistrés par GenOS.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli fossil list [args]
    Explore {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Conduit une recherche expérimentale approfondie sur une anomalie
    ///
    /// SYNOPSIS :
    ///     g research [FICHIER_ANOMALIE] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Déclenche une batterie d'analyses contrefactuelles sur une anomalie signalée.
    ///
    /// PAR DÉFAUT :
    ///     Examine 'anomaly.json'.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli experiment bug-investigation [anomaly.json | <args>]
    Research {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Effectue une recherche globale dans le corpus documentaire et vectoriel
    ///
    /// SYNOPSIS :
    ///     g search [MOTS_CLÉS] [ARGS]...
    ///
    /// DESCRIPTION :
    ///     Recherche plein texte et sémantique dans l'index de connaissances de la plateforme.
    ///
    /// SOUS LE CAPOT :
    ///     genos-cli platform search ["<requête>" | <args>]
    Search {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

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

#[tokio::main]
async fn main() {
    let Cli { yes, command } = Cli::parse();

    if !yes && matches!(
        &command,
        Commands::Destroy { .. }
            | Commands::Wipe { .. }
            | Commands::Close { .. }
            | Commands::Keep { .. }
    ) {
        eprintln!("Cette commande modifie l'état GenOS. Relancez-la avec --yes pour confirmer.");
        std::process::exit(2);
    }

    match command {
        Commands::Start => {
            println!("Démarrage du serveur GenOS API...");
            if std::net::TcpStream::connect("127.0.0.1:8085").is_ok() {
                command_error("le serveur GenOS est déjà en ligne sur le port 8085");
            }

            let log_file = std::fs::File::create("genos_server.log")
                .unwrap_or_else(|error| command_error(format!("impossible de créer genos_server.log: {}", error)));
            let err_file = log_file
                .try_clone()
                .unwrap_or_else(|error| command_error(format!("impossible de préparer le journal d'erreurs: {}", error)));

            let child = std::process::Command::new("cargo")
                .args(["run", "-q", "-p", "genos-cli", "--", "serve"])
                .stdout(std::process::Stdio::from(log_file))
                .stderr(std::process::Stdio::from(err_file))
                .spawn()
                .unwrap_or_else(|error| command_error(format!("impossible de démarrer le serveur: {}", error)));

            println!("Serveur démarré en arrière-plan avec le PID: {} (Logs dans genos_server.log)", child.id());
            std::fs::write(".genos_server.pid", child.id().to_string())
                .unwrap_or_else(|error| command_error(format!("impossible d'écrire .genos_server.pid: {}", error)));
        }
        Commands::Stop => {
            println!("Arrêt du serveur GenOS...");
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                let pid = pid_str
                    .trim()
                    .parse::<u32>()
                    .unwrap_or_else(|error| command_error(format!("PID invalide dans .genos_server.pid: {}", error)));
                if std::net::TcpStream::connect("127.0.0.1:8085").is_err() {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!("le serveur est déjà arrêté; PID stale supprimé ({})", pid));
                }
                let status = {
                    #[cfg(windows)]
                    { std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .status() }
                    #[cfg(not(windows))]
                    { std::process::Command::new("kill").arg(pid.to_string()).status() }
                };
                match status {
                    Ok(status) if status.success() => {
                        println!("Serveur arrêté (PID: {}).", pid);
                    }
                    Ok(status) => command_error(format!("impossible d'arrêter le serveur (code {})", status.code().unwrap_or(1))),
                    Err(error) => command_error(format!("impossible d'arrêter le serveur: {}", error)),
                }
                if std::net::TcpStream::connect("127.0.0.1:8085").is_ok() {
                    command_error("le port 8085 est encore ouvert après l'arrêt");
                }
                    let _ = std::fs::remove_file(".genos_server.pid");
            } else {
                println!("Aucun serveur GenOS en cours d'exécution (pid file introuvable).");
                std::process::exit(1);
            }
        }
        Commands::Status => {
            println!("Vérification du statut du serveur GenOS...");
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                println!("Le serveur semble être en cours d'exécution (PID: {}).", pid_str.trim());
                if std::net::TcpStream::connect("127.0.0.1:8085").is_ok() {
                    println!("Statut: EN LIGNE (Port 8085 ouvert)");
                } else {
                    println!("Statut: HORS LIGNE (Port 8085 inaccessible)");
                    let _ = std::fs::remove_file(".genos_server.pid");
                    std::process::exit(1);
                }
            } else {
                println!("Statut: ARRÊTÉ");
                std::process::exit(1);
            }
        }
        Commands::Run => {
            println!("Lancement d'une tâche (création d'agent de test)...");
            let status = std::process::Command::new("cargo")
                .args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "task-worker", "--out", ".genos-task.json"])
                .status();
            match status {
                Ok(s) if s.success() => println!("Tâche lancée et agent créé avec succès."),
                _ => println!("Erreur lors du lancement de la tâche."),
            }
        }
        Commands::List => {
            println!("Liste des fossiles stockés...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            exit_on_command_failure(cmd.status());
        }
        Commands::Init => {
            println!("Initialisation de GenOS...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "init"]);
            exit_on_command_failure(cmd.status());
        }
        Commands::Replay { args } => {
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du replay sur le snapshot par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Diff { args } => {
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : comparaison entre origin et latest)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff", "origin", "latest"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Blame { args } => {
            println!("Analyse de la source de l'hallucination / Blame...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : analyse de l'hallucination sur latest-snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Trace { args } => {
            println!("Traçage de la causalité / Trace...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : traçage causal sur incident par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay", "default-trace.log"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Clone { args } => {
            println!("Clonage de l'agent...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : clonage de l'agent parent par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork", "--parent-id", "default-parent"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Mutate { args } => {
            println!("Mutation de l'agent...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : mutation du trait créativité)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate", "--agent-id", "default-agent", "--trait", "creativity"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Elevate { args } => {
            println!("Élévation de l'agent / Adapt...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : élévation de l'agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "1.0"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Rest { args } => {
            println!("Mise en repos de l'agent (Cryptobiosis)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : cryptobiose de default-agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis", "--agent-id", "default-agent"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Check { args } => {
            println!("Vérification / Audit...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : audit du latest-snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Compare { args } => {
            println!("Comparaison des phénotypes...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : comparaison phénotypique sur default-trait)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence", "--trait-name", "default-trait", "--expected", "1.0", "--observed", "0.9", "--tolerance", "0.2"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Retrace { args } => {
            println!("Retraçage / Incident...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : analyse de l'incident par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident", "default-manifest.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Restore { args } => {
            println!("Restauration depuis un snapshot (Capsule Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création de capsule depuis latest-snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Recover { args } => {
            println!("Récupération (Causal Replay)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : récupération causale par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay", "default-recovery.log"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Retrieve { args } => {
            println!("Recherche RAG / Retrieve...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche de 'default query')");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", "default query"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Filter { args } => {
            println!("Filtrage des impasses (Loop Detection)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : détection de boucle sur history.log)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection", "--history-file", "history.log"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Merge { args } => {
            println!("Fusion de branches (Capsule Merge)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : fusion de la branche courante)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge", "default-branch"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Parent { args } => {
            println!("Analyse de la généalogie (Swarm Allele)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : analyse des allèles du swarm par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer", "--swarm-id", "default-swarm"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Lineage { args } => {
            println!("Historique des fossiles (Lineage)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            if !args.is_empty() { cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        Commands::Squeeze { args } => {
            println!("Condensation de l'agent (Prune)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : pruning de default-agent à 0.5)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.5"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Think { args } => {
            println!("Évaluation du chemin neuronal (Think)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : évaluation neuronale de default-agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "input", "--post-node", "output"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Trio { args } => {
            println!("Déploiement en trio (Trinity)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement trinity sur mission alpha)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "mission-alpha", "--strategies", "trio-default"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Multi { args } => {
            println!("Exécution multi-agents (World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : application des paramètres par défaut)");
                cmd.args([
                    "run", "-q", "-p", "genos-cli", "--", "world", "run",
                    "--provider", "local",
                    "--root", "./multi-world",
                    "--world-id", "default-multi",
                    "--command", "auto-start",
                    "--sandbox-backend", "native"
                ]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Broad { args } => {
            println!("Expansion des connaissances (Platform Ingest)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("Veuillez spécifier le chemin d'un fichier. Exemple : .\\g broad ./README.md");
                println!("(Ou ingestion par défaut du README.md...)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "ingest", "./README.md"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "ingest"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Swarm { args } => {
            println!("Gestion de l'essaim (Swarm)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement de l'analyseur par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer", "--swarm-id", "alpha-swarm"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Debug { args } => {
            println!("Débogage (Bug Investigation)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : investigation du manifeste par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation", "default-manifest.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Destroy { args } => {
            println!("Destruction / Prune...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : destruction / extinction de l'agent par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "record", "--lineage-id", "default-lineage", "--reason", "destroyed_by_user"]);
            } else {
                // Alternatively could map to agent prune, but fossil record fits "destroy" lineage well
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "record"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Close { args } => {
            println!("Fermeture (World Run Stop)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : fermeture du monde par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "default", "--command", "stop", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Order { args } => {
            println!("Ordre / Conformité (Compliance Generate)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : génération de conformité standard ISO)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "compliance", "generate", "--standard", "iso-genos-1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "compliance", "generate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Auto { args } => {
            println!("Mode Automatique (Trinity Deploy / Auto-start)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement autonome Trinity)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "auto-mission", "--strategies", "autonomous"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Fast { args } => {
            println!("Mode Rapide (Strategy Adapt / Time Constraint)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : adaptation de la stratégie pour une vitesse maximale)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "0.1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Copy { args } => {
            println!("Copie / Sauvegarde (Snapshot Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création d'un snapshot de l'agent par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "create", "--agent", "default-agent", "--out", "snapshot_copy.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Hub { args } => {
            println!("Hub / Création de monde (World Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création d'un hub local)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "create", "--provider", "local", "--root", "./hub", "--world-id", "hub-01"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Wisdom { args } => {
            println!("Sagesse / Base de connaissances (Platform Search)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche de la sagesse universelle dans l'index)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", "wisdom"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Synapse { args } => {
            println!("Synapse / Réseau Neuronal (Synaptic)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : évaluation du réseau synaptique par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "0", "--post-node", "1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Wipe { args } => {
            println!("Nettoyage / Effacement (Agent Prune Maximum)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : élagage radical de l'agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.99"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Operate { args } => {
            println!("Opération (World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement des opérations sur le hub par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "hub-01", "--command", "operate", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Dissect { args } => {
            println!("Dissection / Extraction (Hallucination Extract)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : dissection du dernier snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "extract", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "extract"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Unveil { args } => {
            println!("Dévoilement (Hallucination Detect)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : détection des hallucinations cachées)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "detect", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "detect"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Root { args } => {
            println!("Ancrage Racine (Causality Fork)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : fork depuis la racine causale)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "causality", "fork", "--boundary-id", "root-boundary", "--new-boundary-id", "new-branch"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "causality", "fork"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Keep { args } => {
            println!("Conservation (Capsule Merge)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : conservation et fusion de la branche)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge", "current-branch"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Quantum { args } => {
            println!("Mode Quantique (World Run - Sandbox Quantum)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : exécution du monde en backend quantique)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "quantum-world", "--command", "start", "--sandbox-backend", "quantum"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Store { args } => {
            println!("Stockage (Snapshot List)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : listage des instantanés stockés)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "list"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "list"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Piece { args } => {
            println!("Ajustement d'un fragment (Synaptic Prune Scale)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : ajustement précis du réseau)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "prune-scale", "--agent-id", "default-agent", "--scale", "0.8"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "prune-scale"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Daemon { args } => {
            println!("Lancement du Démon (Serve)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du daemon sur le port par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "serve"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "serve"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Preagi { args } => {
            println!("Création de l'entité Pre-AGI (Agent Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création de l'agent pre-agi-core)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "pre-agi-core", "--out", "preagi-snapshot.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Civilization { args } => {
            println!("Simulation de civilisation (World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du monde civilization-alpha)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "civilization-alpha", "--command", "start", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Explore { args } => {
            println!("Exploration des strates (Fossil List)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : listage profond des fossiles)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Research { args } => {
            println!("Recherche approfondie (Experiment Bug Investigation)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche sur une anomalie générique)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation", "anomaly.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Search { args } => {
            println!("Recherche globale (Platform Search)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche vide)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", ""]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::TwoParallel { args } => {
            println!("Double exécution parallèle (Trinity Deploy / Duo)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement en duo)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "duo-mission", "--strategies", "duo-strategy"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::TriParallel { args } => {
            println!("Triple exécution parallèle (Trinity Deploy)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement en trio)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "trio-mission", "--strategies", "trio-strategy"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::MultiParallel { args } => {
            println!("Exécution massivement parallèle (Swarm / World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du monde multi-parallèle)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "multi-parallel-world", "--command", "start", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Ruins { args } => {
            println!("Exploration des ruines (Fossil List Extinct)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : listage des anciens fossiles éteints)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Id { args } => {
            println!("Identification (Audit de l'ID)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : audit de l'identifiant par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "default-id"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Mind { args } => {
            println!("Analyse de l'esprit (Synaptic Path Evaluate)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : évaluation du cheminement mental)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-mind", "--pre-node", "0", "--post-node", "1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Generate { args } => {
            if args.is_empty() {
                println!("Usage: .\\g generate <Dossier> <Prompt...>");
                return;
            }
            let target_dir = format!("../{}", args[0]);
            let prompt = args[1..].join(" ");
            
            println!("🧬 [GenOS] Éveil de l'Agent de Génération (World: {})...", args[0]);
            let _ = std::fs::create_dir_all(&target_dir);
            let genos_dir = format!("{}/.genos", target_dir);
            let _ = std::fs::create_dir_all(&genos_dir);
            
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();

            // STEP 1: CAHIER DES CHARGES (Blueprint)
            println!("🧠 [Thalamus] Phase 1/3: Réflexion et création du cahier des charges...");
            let blueprint_prompt = format!(
                "Agis comme un architecte logiciel (GenOS Agent). L'utilisateur demande : '{}'. 
                Rédige un cahier des charges détaillé (objectifs, structure des fichiers, design system, étapes de développement).", prompt
            );
            let body1 = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": blueprint_prompt }]
            });
            let mut blueprint_text = String::new();
            if let Ok(res) = client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body1).send().await {
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        blueprint_text = text.to_string();
                        let _ = std::fs::write(format!("{}/blueprint.md", genos_dir), &blueprint_text);
                        println!("✔️ Cahier des charges enregistré dans .genos/blueprint.md");
                    }
                }
            }

            // STEP 2: CODE GENERATION (Execution)
            println!("⚡ [Cortex] Phase 2/3: Génération du code source...");
            let full_prompt = format!(
                "Voici le cahier des charges :\n{}\n\nGénère le code source complet.
                IMPORTANT : Tu DOIS répondre EXACTEMENT avec ce format JSON et RIEN D'AUTRE, pas de markdown, juste le tableau JSON brut :
                [{{\"filename\": \"index.html\", \"content\": \"...\"}}, {{\"filename\": \"style.css\", \"content\": \"...\"}}]", blueprint_text
            );
            let body2 = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": full_prompt }]
            });
            if let Ok(res) = client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body2).send().await {
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        let clean_text = text.trim().strip_prefix("```json").unwrap_or(text.trim()).strip_suffix("```").unwrap_or(text.trim());
                        if let Ok(files) = serde_json::from_str::<serde_json::Value>(clean_text) {
                            if let Some(file_array) = files.as_array() {
                                for file in file_array {
                                    if let (Some(name), Some(content)) = (file["filename"].as_str(), file["content"].as_str()) {
                                        let file_path = std::path::Path::new(&target_dir).join(name);
                                        if let Ok(_) = std::fs::write(&file_path, content) {
                                            println!("✔️ Créé : {}", file_path.display());
                                        }
                                    }
                                }
                            }
                        } else {
                            println!("⚠️ Le modèle n'a pas respecté le format JSON strict.");
                        }
                    }
                }
            }

            // STEP 3: AUDIT & SELF-REFLECTION
            println!("👁️ [Synapse] Phase 3/3: Auto-évaluation du résultat...");
            let audit_prompt = format!(
                "Tu viens de générer le projet pour : '{}'. Fais un court audit de ton propre travail, identifie les points forts et les limites de ta génération, et propose les prochaines étapes.", prompt
            );
            let body3 = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": audit_prompt }]
            });
            if let Ok(res) = client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body3).send().await {
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        let _ = std::fs::write(format!("{}/audit.md", genos_dir), text);
                        println!("✔️ Audit enregistré dans .genos/audit.md");
                    }
                }
            }
            
            println!("✅ Opération GenOS terminée. L'agent retourne en veille.");
        }
        Commands::Ask { args } => {
            if args.is_empty() {
                println!("Usage: .\\g ask <Votre question ou problème...>");
                println!("Exemple : .\\g ask Quelle est la capitale du Burundi ?");
                return;
            }
            if std::net::TcpStream::connect("127.0.0.1:8085").is_err() {
                eprintln!("⚠️ Le serveur GenOS n'est pas démarré sur le port 8085.");
                eprintln!("💡 Lancez d'abord './g start' pour éveiller le cortex GenOS.");
                std::process::exit(1);
            }
            let prompt = args.join(" ");
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();
            let body = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": prompt }]
            });
            match client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body).send().await {
                Ok(res) if res.status().is_success() => {
                    if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                        if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                            println!("{}", text);
                        } else {
                            eprintln!("⚠️ Réponse inattendue du modèle : {:?}", json_resp);
                        }
                    } else {
                        eprintln!("⚠️ Impossible de lire la réponse JSON du serveur.");
                    }
                }
                Ok(res) => eprintln!("⚠️ Erreur HTTP du serveur : {}", res.status()),
                Err(err) => eprintln!("⚠️ Erreur de communication : {}", err),
            }
        }
        Commands::Chat => {
            if std::net::TcpStream::connect("127.0.0.1:8085").is_err() {
                eprintln!("⚠️ Le serveur GenOS n'est pas démarré sur le port 8085.");
                eprintln!("💡 Lancez d'abord './g start' pour éveiller le cortex GenOS.");
                std::process::exit(1);
            }
            println!("💬 Session de discussion GenOS active (tapez 'exit' ou 'quit' pour quitter).");
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();
            let mut history: Vec<serde_json::Value> = Vec::new();
            loop {
                use std::io::Write;
                print!("\n🧑 Vous > ");
                let _ = std::io::stdout().flush();
                let mut line = String::new();
                if std::io::stdin().read_line(&mut line).is_err() || line.trim().is_empty() {
                    continue;
                }
                let trimmed = line.trim();
                if trimmed.eq_ignore_ascii_case("exit") || trimmed.eq_ignore_ascii_case("quit") {
                    println!("👋 Fin de la session GenOS.");
                    break;
                }
                history.push(serde_json::json!({ "role": "user", "content": trimmed }));
                let body = serde_json::json!({
                    "model": "genos-core-v3",
                    "messages": history.clone()
                });
                print!("🧠 GenOS > ");
                let _ = std::io::stdout().flush();
                match client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body).send().await {
                    Ok(res) if res.status().is_success() => {
                        if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                            if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                                println!("{}", text);
                                history.push(serde_json::json!({ "role": "assistant", "content": text }));
                            } else {
                                println!("(Réponse vide)");
                            }
                        }
                    }
                    Ok(res) => println!("(Erreur HTTP {})", res.status()),
                    Err(err) => println!("(Erreur de connexion : {})", err),
                }
            }
        }
    }
}

