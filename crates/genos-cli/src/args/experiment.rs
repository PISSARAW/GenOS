use super::{ArgsMacro, OutputFormat};
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct ExperimentCommand {
    #[command(subcommand)]
    pub command: ExperimentSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum ExperimentSubcommands {
    /// Fork and execute an isolated workspace graph from a YAML/JSON manifest.
    Workspace(WorkspaceExperimentArgs),
    /// Replay one historical event stream through several causal universes.
    Temporal(TemporalExperimentArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct WorkspaceExperimentArgs {
    pub manifest: PathBuf,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct TemporalExperimentArgs {
    pub manifest: PathBuf,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}
