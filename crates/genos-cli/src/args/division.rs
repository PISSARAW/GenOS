use super::ArgsMacro;
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct DivisionCommand {
    #[command(subcommand)]
    pub command: DivisionSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum DivisionSubcommands {
    /// Attested clonal fan-out of one capsule (mitosis): every daughter is
    /// verified identical to the parent. Priority use case: redundant
    /// parallel execution and majority voting.
    Mitosis(DivisionMitosisArgs),
    /// Symmetric lightweight scale-out (binary fission): the parent budget is
    /// split evenly and daughters carry no hypothesis metadata.
    Fission(DivisionFissionArgs),
    /// Asymmetric bounded delegation (budding): the parent stays intact while
    /// a specialized bud gets its own small budget; Hayflick-limited.
    Bud(DivisionBudArgs),
    /// Atomic speculative fan-out (schizogony): all branches are validated
    /// internally and released together or not at all.
    Schizogony(DivisionSchizogonyArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct DivisionMitosisArgs {
    pub capsule_id: String,
    /// Number of attested clones to release.
    #[arg(long, default_value_t = 2)]
    pub count: u32,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct DivisionFissionArgs {
    pub capsule_id: String,
    /// Number of lightweight daughters; the parent budget is divided by this.
    #[arg(long, default_value_t = 2)]
    pub count: u32,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct DivisionBudArgs {
    pub capsule_id: String,
    /// Short name of the delegated sub-task (stored as `bud:<label>`).
    #[arg(long)]
    pub label: String,
    /// What the bud is expected to demonstrate.
    #[arg(long, default_value = "delegated sub-task")]
    pub hypothesis: String,
    /// Step budget granted to the bud; the parent keeps its own budget.
    #[arg(long, default_value_t = 10)]
    pub steps: u64,
    /// Maximum buds this parent may ever produce (Hayflick limit).
    #[arg(long, default_value_t = 8)]
    pub max_buds: u32,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct DivisionSchizogonyArgs {
    pub capsule_id: String,
    /// Repeat as LABEL=HYPOTHESIS; released atomically in one burst.
    #[arg(long = "branch", required = true)]
    pub branches: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}
