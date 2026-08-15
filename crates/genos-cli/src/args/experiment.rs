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
    /// Falsify competing bug explanations in isolated code worlds.
    BugInvestigation(BugInvestigationArgs),
    /// Analyze a fixed-genome cohort under controlled treatments.
    Heredity(GenericExperimentArgs),
    /// Apply hard constraints and Pareto selection to evaluated genomes.
    Select(GenericExperimentArgs),
    /// Evaluate functional reproducibility from paired behavior traces.
    Reproducibility(GenericExperimentArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct GenericExperimentArgs {
    pub manifest: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
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

#[derive(ArgsMacro, Debug)]
pub struct BugInvestigationArgs {
    pub manifest: PathBuf,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
    /// Print surviving and rejected explanations while retaining full evidence.
    #[arg(long)]
    pub summary: bool,
}
