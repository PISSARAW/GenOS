use clap::Subcommand;

#[derive(Subcommand)]
pub enum RecoveryCommands {
    /// Récupère l'état d'orchestration depuis un checkpoint et WAL
    ///
    /// SYNOPSIS :
    ///     g recovery rehydrate [OPTIONS]
    ///
    /// DESCRIPTION :
    ///     Réhydrate l'état de l'orchestrateur à partir du dernier checkpoint
    ///     et rejoue les entrées WAL pour récupérer les continuations en vol.
    ///
    ///     Affiche un plan de récupération (dry-run par défaut) sans exécuter
    ///     la reprise. Utilisez --execute pour appliquer la récupération.
    ///
    /// EXEMPLES :
    ///     g recovery rehydrate --dry-run
    ///     g recovery rehydrate --from-checkpoint 42 --execute
    ///     g recovery rehydrate --wal-path .genos/orchestration/continuations.wal --checkpoint-path .genos/orchestration/orchestration.checkpoint.json
    Rehydrate {
        /// Mode simulation uniquement (défaut: true)
        #[arg(long, default_value_t = true)]
        dry_run: bool,

        /// Exécute réellement la récupération (nécessite --yes pour confirmer)
        #[arg(long, conflicts_with = "dry_run")]
        execute: bool,

        /// Numéro de séquence du checkpoint à partir duquel récupérer
        #[arg(long)]
        from_checkpoint: Option<u64>,

        /// Chemin vers le fichier WAL des continuations
        #[arg(long, default_value = ".genos/orchestration/continuations.wal")]
        wal_path: String,

        /// Chemin vers le fichier de checkpoint d'orchestration
        #[arg(long, default_value = ".genos/orchestration/orchestration.checkpoint.json")]
        checkpoint_path: String,

        /// Répertoire de stockage GenOS
        #[arg(long, default_value = ".genos")]
        store_dir: String,
    },

    /// Affiche l'intégrité du WAL et du dernier checkpoint
    ///
    /// SYNOPSIS :
    ///     g recovery wal-status
    ///
    /// DESCRIPTION :
    ///     Vérifie l'intégrité cryptographique du WAL (hashes SHA-256)
    ///     et affiche les métadonnées du dernier checkpoint.
    WalStatus {
        /// Chemin vers le fichier WAL
        #[arg(long, default_value = ".genos/orchestration/continuations.wal")]
        wal_path: String,

        /// Chemin vers le fichier de checkpoint
        #[arg(long, default_value = ".genos/orchestration/orchestration.checkpoint.json")]
        checkpoint_path: String,
    },

    /// Tronque le WAL avant une séquence donnée (maintenance)
    ///
    /// SYNOPSIS :
    ///     g recovery truncate --before-seq 100
    ///
    /// DESCRIPTION :
    ///     Supprime les entrées WAL antérieures à la séquence spécifiée.
    ///     Opération destructrice, nécessite --yes.
    Truncate {
        /// Séquence avant laquelle tronquer (exclue)
        #[arg(long)]
        before_seq: u64,

        /// Chemin vers le fichier WAL
        #[arg(long, default_value = ".genos/orchestration/continuations.wal")]
        wal_path: String,
    },
}