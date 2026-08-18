use super::{ArgsMacro, OutputFormat};
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct ReplayCommand {
    #[command(subcommand)]
    pub command: ReplaySubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum ReplaySubcommands {
    Basic(ReplayBasicArgs),
    FromSnapshot(ReplayFromSnapshotArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct ReplayBasicArgs {
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub events: Option<PathBuf>,
    #[arg(long, conflicts_with = "snapshot")]
    pub branch_id: Option<String>,
    /// Replay the branch owned by this snapshot (file path or snapshot id) and
    /// assert the replayed stream stays bound to that snapshot's agent.
    #[arg(long)]
    pub snapshot: Option<String>,
    /// Snapshot store used to resolve `--snapshot` by id.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Exit non-zero unless the replayed state ends on this agent id.
    #[arg(long)]
    pub expect_agent_id: Option<String>,
    /// Exit non-zero unless the replayed state ends on this branch id.
    #[arg(long)]
    pub expect_branch_id: Option<String>,
    /// Exit non-zero unless the replayed state ends on this sequence number.
    #[arg(long)]
    pub expect_last_sequence: Option<u64>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct ReplayFromSnapshotArgs {
    #[arg(long)]
    pub snapshot_id: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    #[arg(long)]
    pub events: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}
