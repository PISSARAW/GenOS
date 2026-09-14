use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct FossilCmd {
    #[command(subcommand)]
    pub subcommand: FossilSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum FossilSubcommands {
    Record {
        #[arg(long)]
        lineage_id: String,
        #[arg(long)]
        reason: String,
        /// Mode de taphonomie : petrification | external_mold | internal_mold | trace
        #[arg(long)]
        mode: Option<String>,
    },
    List,
    /// Affiche les strates sédimentaires (datation stratigraphique).
    Strata,
    /// Excave un fossile en lecture seule (aucune résurrection possible).
    Excavate {
        #[arg(long)]
        fossil_id: String,
    },
    /// Décode les mélanosomes (phénotype résiduel) d'un fossile.
    Decode {
        #[arg(long)]
        fossil_id: String,
    },
}

#[derive(Args, Debug)]
pub struct ServeCmd {
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value_t = 8085)]
    pub port: u16,
    #[arg(long)]
    pub api_key: Option<String>,
}
