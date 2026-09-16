use clap::Subcommand;

pub mod core;
pub mod query;
pub mod advanced;
pub mod system;
pub mod recovery;

#[derive(Subcommand)]
pub enum Commands {
    #[command(flatten)]
    Core(core::CoreCommands),
    #[command(flatten)]
    Query(query::QueryCommands),
    #[command(flatten)]
    Advanced(advanced::AdvancedCommands),
    #[command(flatten)]
    System(system::SystemCommands),
    #[command(flatten)]
    Recovery(recovery::RecoveryCommands),
}

pub use core::CoreCommands;
pub use query::QueryCommands;
pub use advanced::AdvancedCommands;
pub use system::SystemCommands;
pub use recovery::RecoveryCommands;
