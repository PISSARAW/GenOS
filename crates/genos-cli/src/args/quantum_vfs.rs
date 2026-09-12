use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct QuantumVfsCmd {
    #[command(subcommand)]
    pub subcommand: QuantumVfsSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum QuantumVfsSubcommands {
    /// Placer un fichier en superposition dans l'espace virtuel quantique
    Stage {
        #[arg(long, default_value = "default_workspace")]
        workspace: String,
        #[arg(long)]
        file: String,
        #[arg(long)]
        content: Option<String>,
    },
    /// Ajouter une hypothèse spéculative alternative dans la superposition
    Superpose {
        #[arg(long, default_value = "default_workspace")]
        workspace: String,
        #[arg(long)]
        file: String,
        #[arg(long)]
        label: String,
        #[arg(long)]
        content: String,
        #[arg(long, default_value_t = 1.0)]
        weight: f64,
    },
    /// Intriquer deux fichiers dépendants (contrat <-> implémentation/test)
    Entangle {
        #[arg(long, default_value = "default_workspace")]
        workspace: String,
        #[arg(long)]
        path_a: String,
        #[arg(long)]
        path_b: String,
        #[arg(long, default_value = "INTERFACE_IMPLEMENTATION")]
        mode: String,
    },
    /// Écrire dans un fichier verrouillé via effet tunnel quantique
    TunnelWrite {
        #[arg(long, default_value = "default_workspace")]
        workspace: String,
        #[arg(long)]
        file: String,
        #[arg(long)]
        content: String,
        #[arg(long, default_value_t = 5.0)]
        energy: f64,
    },
    /// Déclencher la décohérence quantique et cristalliser sur le disque classique
    Decohere {
        #[arg(long, default_value = "default_workspace")]
        workspace: String,
        #[arg(long, default_value = "PERSISTENCE_FLUSH")]
        trigger: String,
        #[arg(long, default_value_t = true)]
        write_to_disk: bool,
    },
    /// Afficher les métriques de cohérence quantique, Bell et Heisenberg
    Metrics {
        #[arg(long, default_value = "default_workspace")]
        workspace: String,
    },
}
