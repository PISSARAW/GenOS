use super::{ArgsMacro, OutputFormat, WorldProviderKind};
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct WorldCommand {
    #[command(subcommand)]
    pub command: WorldSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum WorldSubcommands {
    Create(WorldCreateArgs),
    Snapshot(WorldSnapshotArgs),
    Fork(WorldForkArgs),
    Diff(WorldDiffArgs),
    Destroy(WorldDestroyArgs),
    /// Read a world-relative file from inside a world.
    ReadFile(WorldReadFileArgs),
    /// Write a world-relative file inside a world.
    WriteFile(WorldWriteFileArgs),
    /// Execute a command inside one isolated world.
    Run(WorldRunArgs),
    /// Check that forked worlds wrote the same file differently and that no
    /// write escaped its world.
    CheckFile(WorldCheckFileArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct WorldRunArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub world_id: String,
    /// Command executed with the selected world as its working directory.
    #[arg(long)]
    pub command: String,
    /// Return success even when the command exits non-zero.
    #[arg(long)]
    pub allow_failure: bool,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldReadFileArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub world_id: String,
    /// World-relative path, for example `hello.txt`.
    #[arg(long)]
    pub path: String,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldWriteFileArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub world_id: String,
    /// World-relative path, for example `hello.txt`.
    #[arg(long)]
    pub path: String,
    #[arg(long)]
    pub contents: String,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldCheckFileArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    /// World-relative path the forks are expected to have written.
    #[arg(long)]
    pub path: String,
    /// World the branches were forked from.
    #[arg(long)]
    pub parent: String,
    /// Contents the parent held before the forks were written to. Defaults to
    /// what it currently holds, which only checks the forks against each other.
    #[arg(long)]
    pub expect_parent: Option<String>,
    /// Expect the file to be absent from the parent world.
    #[arg(long, conflicts_with = "expect_parent")]
    pub expect_parent_absent: bool,
    /// Forked world id. Repeatable.
    #[arg(long = "branch", value_name = "WORLD_ID")]
    pub branches: Vec<String>,
    /// Contents the matching `--branch` wrote, in the same order. Repeatable.
    #[arg(long = "expect", value_name = "CONTENTS")]
    pub expects: Vec<String>,
    /// Exit non-zero unless every world kept its own write, the parent kept its
    /// pre-fork contents, and no two worlds ended on the same contents.
    #[arg(long)]
    pub expect_isolated: bool,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldCreateArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub seed: Option<PathBuf>,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldSnapshotArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub world_id: String,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldForkArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshot_id: String,
    #[arg(long, default_value_t = 1)]
    pub count: u32,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldDiffArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub world_a: String,
    #[arg(long)]
    pub world_b: String,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct WorldDestroyArgs {
    #[arg(long, value_enum)]
    pub provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    pub root: PathBuf,
    #[arg(long)]
    pub world_id: String,
    #[arg(long)]
    pub repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}
