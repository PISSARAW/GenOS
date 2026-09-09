use clap::Parser;
use genos_simple_cli::config::Cli;
use genos_simple_cli::handlers::handle_command;

fn main() {
    let cli = Cli::parse();
    handle_command(cli);
}
