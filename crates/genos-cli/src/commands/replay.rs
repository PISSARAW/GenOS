use crate::args::ReplaySubcommands;

pub fn execute(cmd: ReplaySubcommands) -> Result<(), String> {
    match cmd {
        ReplaySubcommands::Basic { snapshot } => handle_basic(&snapshot),
    }
}

fn handle_basic(snapshot: &str) -> Result<(), String> {
    Err(format!(
        "Replay is unavailable: snapshot '{}' cannot be re-executed with verified causal fidelity yet.",
        snapshot
    ))
}
