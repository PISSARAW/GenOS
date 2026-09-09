use crate::{config::Cli, commands::Commands};
use std::process::ExitStatus;

pub fn exit_on_command_failure(status: Result<ExitStatus, std::io::Error>) {
    match status {
        Ok(status) if status.success() => {}
        Ok(status) => std::process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("Échec de l'exécution de la commande: {}", error);
            std::process::exit(1);
        }
    }
}

pub fn command_error(message: impl std::fmt::Display) -> ! {
    eprintln!("Erreur: {}", message);
    std::process::exit(1);
}

mod core;
mod query;
mod advanced;
mod system;

fn run_command(command: &Commands, yes: bool) {
    match command {
        Commands::Core(cmd) => core::handle_core(cmd, yes),
        Commands::Query(cmd) => query::handle_query(cmd, yes),
        Commands::Advanced(cmd) => advanced::handle_advanced(cmd, yes),
        Commands::System(cmd) => system::handle_system(cmd, yes),
    }
}

pub fn handle_command(cli: Cli) {
    if !cli.yes && matches!(
        &cli.command,
        Commands::Advanced(cmd) if matches!(cmd, crate::commands::advanced::AdvancedCommands::Destroy { .. } | crate::commands::advanced::AdvancedCommands::Wipe { .. } | crate::commands::advanced::AdvancedCommands::Close { .. } | crate::commands::advanced::AdvancedCommands::Keep { .. })
    ) {
        eprintln!("Cette commande modifie l'état GenOS. Relancez-la avec --yes pour confirmer.");
        std::process::exit(2);
    }
    run_command(&cli.command, cli.yes);
}
