use super::{ArgsMacro, OutputFormat};
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct HallucinationCommand {
    #[command(subcommand)]
    pub command: HallucinationSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum HallucinationSubcommands {
    /// Scan a snapshot or a JSONL trace for missing execution receipts and
    /// ungrounded claims.
    Detect(HallucinationDetectArgs),
    /// Inject a controlled false premise into a snapshot for red teaming.
    Inject(HallucinationInjectArgs),
    /// Execute an ImpossibleBench-style grounding suite against a snapshot.
    Test(HallucinationTestArgs),
    /// Export a snapshot's belief evidence graph as JSON or YAML.
    Extract(HallucinationExtractArgs),
    /// Compute semantic-entropy style metrics over a snapshot's beliefs.
    Analyze(HallucinationAnalyzeArgs),
    /// Reject every ungrounded belief on a snapshot via process supervision.
    Correct(HallucinationCorrectArgs),
    /// Replay an injection inside an isolated in-memory fork and report what
    /// detection flags. No model is called; `--model` is recorded only.
    Simulate(HallucinationSimulateArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationDetectArgs {
    /// Snapshot to audit: file path or snapshot id resolved in the store.
    #[arg(long, conflicts_with = "trace")]
    pub snapshot: Option<String>,
    /// JSONL trace of tool-output records; each line must carry a non-null
    /// `receipt` with `verified_by_env: true` to pass the audit.
    #[arg(long, value_name = "PATH")]
    pub trace: Option<PathBuf>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Exit non-zero when at least one finding is reported.
    #[arg(long)]
    pub fail_on_findings: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationInjectArgs {
    /// Snapshot receiving the false premise: file path or snapshot id.
    #[arg(long)]
    pub snapshot: String,
    /// Subject key of the belief that carries the injected premise.
    #[arg(long = "target-belief", value_name = "KEY")]
    pub target_belief: String,
    #[arg(long, default_value = "injected_premise")]
    pub predicate: String,
    #[arg(long, default_value = "unverified claim (red-team injection)")]
    pub value: String,
    #[arg(long, default_value_t = 0.5)]
    pub confidence: f32,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the polluted snapshot here. Defaults to the file the snapshot
    /// was loaded from when `--snapshot` is a file path.
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long)]
    pub save: bool,
    #[arg(long)]
    pub events: Option<PathBuf>,
    #[arg(long)]
    pub emit_events: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationTestArgs {
    /// Suite file (YAML/JSON array): each case is
    /// `{ "subject": KEY, "predicate"?: P, "object"?: V, "expect":
    /// grounded|ungrounded|absent }`.
    #[arg(long, value_name = "PATH")]
    pub suite: PathBuf,
    #[arg(long)]
    pub snapshot: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationExtractArgs {
    #[arg(long)]
    pub snapshot: String,
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationAnalyzeArgs {
    #[arg(long)]
    pub snapshot: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationCorrectArgs {
    /// Agent the supervised snapshot must belong to; mismatches abort.
    #[arg(long)]
    pub agent_id: String,
    #[arg(long)]
    pub snapshot: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long)]
    pub save: bool,
    /// Exit non-zero unless at least one belief was rejected.
    #[arg(long)]
    pub expect_rejections: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct HallucinationSimulateArgs {
    /// Model name recorded in the simulation report. No model is called.
    #[arg(long)]
    pub model: String,
    #[arg(long)]
    pub snapshot: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the polluted fork here for inspection. The fork stays in memory
    /// otherwise.
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}
