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
    /// Adaptively search mutated universes for a rare incident reproduction.
    Incident(IncidentExperimentArgs),
    /// Version hypotheses, protocols, evidence, peer review and reproductions.
    Scientific(ScientificExperimentArgs),
    /// Co-evolve abstract Red and Blue genomes in isolated simulated worlds.
    SecurityCoevolution(SecurityCoevolutionArgs),
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

#[derive(ArgsMacro, Debug)]
pub struct IncidentExperimentArgs {
    pub manifest: PathBuf,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
    /// Print counts and perfect branch ids while keeping the full persisted report.
    #[arg(long)]
    pub summary: bool,
}

#[derive(ArgsMacro, Debug)]
pub struct ScientificExperimentArgs {
    pub manifest: PathBuf,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
    /// Print the scientific graph totals while retaining the complete report.
    #[arg(long)]
    pub summary: bool,
}

#[derive(ArgsMacro, Debug)]
pub struct SecurityCoevolutionArgs {
    pub manifest: PathBuf,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
    /// Print population totals while retaining every generation in the report.
    #[arg(long)]
    pub summary: bool,
}
