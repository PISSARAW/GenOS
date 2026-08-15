use super::ArgsMacro;
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct CapsuleCommand {
    #[command(subcommand)]
    pub command: CapsuleSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum CapsuleSubcommands {
    Create(CapsuleCreateArgs),
    Fork(CapsuleForkArgs),
    Checkpoint(CapsuleIdArgs),
    Pause(CapsuleIdArgs),
    Resume(CapsuleIdArgs),
    Inspect(CapsuleIdArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct CapsuleCreateArgs {
    #[arg(long)]
    pub snapshot: String,
    #[arg(long)]
    pub seed: Option<PathBuf>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Execution steps assigned to the new capsule.
    #[arg(long, default_value_t = 100)]
    pub budget_steps: u64,
}

#[derive(ArgsMacro, Debug)]
pub struct CapsuleForkArgs {
    pub capsule_id: String,
    /// Repeat as LABEL=HYPOTHESIS.
    #[arg(long = "branch", required = true)]
    pub branches: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct CapsuleIdArgs {
    pub capsule_id: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}
