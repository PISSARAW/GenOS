use clap::Subcommand;

pub mod core;
pub mod query;
pub mod advanced;
pub mod system;

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
}

pub use core::CoreCommands;
pub use query::QueryCommands;
pub use advanced::AdvancedCommands;
pub use system::SystemCommands;
