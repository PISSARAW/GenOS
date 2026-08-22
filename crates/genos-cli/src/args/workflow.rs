use clap::{Args, Subcommand};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct WorkflowCommand {
    #[command(subcommand)]
    pub command: WorkflowSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum WorkflowSubcommands {
    /// Create a documented starter workflow manifest.
    Init(WorkflowInitArgs),
    /// Validate a workflow manifest without executing it.
    Validate(WorkflowManifestArgs),
    /// Execute a workflow and stream its events as JSONL.
    Run(WorkflowRunArgs),
    /// Continue a paused human-in-the-loop run.
    Resume(WorkflowResumeArgs),
    /// Run a manifest repeatedly with an input supplied on stdin or the CLI.
    Playground(WorkflowRunArgs),
    /// Build a portable, integrity-checked workflow package.
    Package(WorkflowPackageArgs),
}

#[derive(Args, Debug)]
pub struct WorkflowInitArgs {
    #[arg(short, long, default_value = "workflow.yaml")]
    pub output: PathBuf,
}

#[derive(Args, Debug)]
pub struct WorkflowManifestArgs {
    pub manifest: PathBuf,
}

#[derive(Args, Debug)]
pub struct WorkflowRunArgs {
    pub manifest: PathBuf,
    /// JSON value passed as the workflow input. If omitted, stdin is read.
    #[arg(short, long)]
    pub input: Option<String>,
    /// Bypass approval nodes. Useful for CI and deterministic tests.
    #[arg(long)]
    pub auto_approve: bool,
}

#[derive(Args, Debug)]
pub struct WorkflowResumeArgs {
    pub run: PathBuf,
    /// approve, reject, or a JSON value replacing the pending action input.
    #[arg(long)]
    pub decision: String,
}

#[derive(Args, Debug)]
pub struct WorkflowPackageArgs {
    pub manifest: PathBuf,
    #[arg(short, long, default_value = "workflow.genos-package.json")]
    pub output: PathBuf,
}
