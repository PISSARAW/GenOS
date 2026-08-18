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
    /// Replace a past agent decision and replay its available future.
    CausalReplay(TemporalExperimentArgs),
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
    /// Reconcile branch claims without unioning their memories.
    CognitiveMerge(GenericExperimentArgs),
    /// Allocate compute, eliminate weak branches, and fork survivors recursively.
    BranchEvolution(GenericExperimentArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct GenericExperimentArgs {
    pub manifest: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorkspaceExperimentArgs {
    /// Complete YAML/JSON manifest. Omit when using --repo and --plan.
    pub manifest: Option<PathBuf>,
    /// Repository or workspace to clone into each experimental branch.
    #[arg(long, value_name = "PATH")]
    pub repo: Option<PathBuf>,
    /// YAML/JSON workspace experiment plan; its seed_dir is replaced by --repo.
    #[arg(long, value_name = "PATH")]
    pub plan: Option<PathBuf>,
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
    /// Complete YAML/JSON manifest. Omit when using the direct input flags.
    pub manifest: Option<PathBuf>,
    /// Production snapshot reference from which universes are forked.
    #[arg(long, value_name = "REF")]
    pub snapshot: Option<String>,
    /// YAML/JSON incident evidence object, or a manifest containing `evidence`.
    #[arg(long, value_name = "PATH")]
    pub evidence: Option<PathBuf>,
    /// YAML/JSON search plan; its evidence is replaced by the direct inputs.
    #[arg(long, value_name = "PATH")]
    pub search_plan: Option<PathBuf>,
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
    /// Complete YAML/JSON manifest. Omit when using --dataset and --research-plan.
    pub manifest: Option<PathBuf>,
    /// Dataset records as JSON/YAML string array or one non-empty record per line.
    #[arg(long, value_name = "PATH")]
    pub dataset: Option<PathBuf>,
    /// YAML/JSON research plan; its records are replaced by --dataset.
    #[arg(long, value_name = "PATH")]
    pub research_plan: Option<PathBuf>,
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
    /// Complete YAML/JSON manifest. Omit when using direct environment inputs.
    pub manifest: Option<PathBuf>,
    /// YAML/JSON scenario array, or a manifest containing `scenarios`.
    #[arg(long, value_name = "PATH")]
    pub environment: Option<PathBuf>,
    /// YAML/JSON evolution plan; its scenarios are replaced by --environment.
    #[arg(long, value_name = "PATH")]
    pub evolution_plan: Option<PathBuf>,
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
    /// Complete YAML/JSON manifest. Omit when using --repo and --plan.
    pub manifest: Option<PathBuf>,
    /// Repository or workspace in which every hypothesis is investigated.
    #[arg(long, value_name = "PATH")]
    pub repo: Option<PathBuf>,
    /// YAML/JSON investigation plan; its seed_dir is replaced by --repo.
    #[arg(long, value_name = "PATH")]
    pub plan: Option<PathBuf>,
    #[arg(long, default_value = ".genos/experiments")]
    pub root: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
    /// Print surviving and rejected explanations while retaining full evidence.
    #[arg(long)]
    pub summary: bool,
}
