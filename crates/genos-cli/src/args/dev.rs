use super::ArgsMacro;
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct DevCommand {
    #[command(subcommand)]
    pub command: DevSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum DevSubcommands {
    /// Create a falsification-oriented hypothesis tree before attempting fixes.
    Diagnose(DiagnoseArgs),
    /// Create concurrent, budget-aware implementation trajectories.
    Solve(SolveArgs),
    /// Attach evidence to a hypothesis and recompute its status.
    HypothesisEvidence(HypothesisEvidenceArgs),
    /// Score trajectories, prune dominated branches, and reallocate compute.
    EvaluateTrajectories(EvaluateTrajectoriesArgs),
    /// Record an architectural decision with causal and spec-to-code lineage.
    RecordDecision(RecordDecisionArgs),
    /// Query why code or tests exist using the decision ledger.
    Blame(BlameArgs),
    /// Invalidate an assumption and identify every affected decision/code/test.
    InvalidateAssumption(InvalidateAssumptionArgs),
    /// Record reusable positive or negative knowledge.
    RecordExperience(RecordExperienceArgs),
    /// Search failed approaches before retrying work.
    SearchFailures(SearchFailuresArgs),
    /// Transfer one provenance-preserving experience between branches.
    CherryPickExperience(CherryPickExperienceArgs),
    /// Plan blind, diverse adversarial and counterfactual review.
    AdversarialReview(AdversarialReviewArgs),
    /// Plan code verification across future worlds or dependency migrations.
    FutureCi(FutureCiArgs),
    /// Create or update the repository genome and its invariants.
    RepositoryGenome(RepositoryGenomeArgs),
    /// Locate the earliest bad cognitive/event/memory/world state.
    BisectAgent(BisectAgentArgs),
    /// Detect regression, repeated repair loops, and a safe revert point.
    AnalyzeTrajectory(AnalyzeTrajectoryArgs),
    /// Compile raw context into a provenance-linked minimal memory.
    CompileMemory(CompileMemoryArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct DiagnoseArgs {
    pub problem: String,
    #[arg(long = "hypothesis", required = true)]
    pub hypotheses: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct SolveArgs {
    pub problem: String,
    #[arg(long = "strategy")]
    pub strategies: Vec<String>,
    #[arg(long, default_value_t = 8)]
    pub branches: usize,
    #[arg(long)]
    pub minimal_patch: bool,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct HypothesisEvidenceArgs {
    pub diagnosis_id: String,
    pub hypothesis_id: String,
    #[arg(long)]
    pub claim: String,
    #[arg(long)]
    pub source: String,
    #[arg(long)]
    pub artifact: Option<String>,
    #[arg(long)]
    pub against: bool,
    #[arg(long)]
    pub confidence: f64,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct EvaluateTrajectoriesArgs {
    pub solve_id: String,
    /// Repeated `trajectory_id=score` values.
    #[arg(long = "score", required = true)]
    pub scores: Vec<String>,
    #[arg(long, default_value_t = 2)]
    pub keep: usize,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct RecordDecisionArgs {
    pub title: String,
    #[arg(long = "alternative")]
    pub alternatives: Vec<String>,
    #[arg(long = "evidence")]
    pub evidence: Vec<String>,
    #[arg(long = "assumption")]
    pub assumptions: Vec<String>,
    #[arg(long = "code-ref")]
    pub code_refs: Vec<String>,
    #[arg(long = "test-ref")]
    pub test_refs: Vec<String>,
    #[arg(long = "requirement-ref")]
    pub requirement_refs: Vec<String>,
    #[arg(long)]
    pub expected: Option<String>,
    #[arg(long)]
    pub observed: Option<String>,
    #[arg(long)]
    pub parent_hypothesis: Option<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct BlameArgs {
    pub reference: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct InvalidateAssumptionArgs {
    pub assumption: String,
    #[arg(long)]
    pub observed: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct RecordExperienceArgs {
    pub strategy: String,
    #[arg(long)]
    pub context: String,
    #[arg(long)]
    pub outcome: String,
    #[arg(long)]
    pub successful: bool,
    #[arg(long = "evidence")]
    pub evidence: Vec<String>,
    #[arg(long)]
    pub source_branch: Option<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct SearchFailuresArgs {
    pub query: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct CherryPickExperienceArgs {
    pub experience_id: String,
    #[arg(long)]
    pub to_branch: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct AdversarialReviewArgs {
    pub target: String,
    #[arg(long = "critic")]
    pub critics: Vec<String>,
    #[arg(long = "world")]
    pub worlds: Vec<String>,
    #[arg(long, default_value_t = 1)]
    pub rounds: u32,
    #[arg(long, default_value_t = true)]
    pub blind: bool,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct FutureCiArgs {
    pub target: String,
    #[arg(long = "world", required = true)]
    pub worlds: Vec<String>,
    #[arg(long = "agent")]
    pub agents: Vec<String>,
    #[arg(long)]
    pub dependency: Option<String>,
    #[arg(long)]
    pub migration_from: Option<String>,
    #[arg(long)]
    pub migration_to: Option<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct RepositoryGenomeArgs {
    #[arg(long = "architecture")]
    pub architecture: Vec<String>,
    #[arg(long = "convention")]
    pub conventions: Vec<String>,
    #[arg(long = "invariant")]
    pub invariants: Vec<String>,
    #[arg(long = "security-rule")]
    pub security_rules: Vec<String>,
    #[arg(long = "testing-policy")]
    pub testing_policy: Vec<String>,
    #[arg(long = "performance-requirement")]
    pub performance_requirements: Vec<String>,
    #[arg(long = "domain-term")]
    pub domain_language: Vec<String>,
    #[arg(long = "forbidden-pattern")]
    pub forbidden_patterns: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}

#[derive(ArgsMacro, Debug)]
pub struct BisectAgentArgs {
    /// Ordered repeated `label=good|bad` observations.
    #[arg(long = "state", required = true)]
    pub states: Vec<String>,
    #[arg(long, default_value = "events")]
    pub dimension: String,
}

#[derive(ArgsMacro, Debug)]
pub struct AnalyzeTrajectoryArgs {
    /// Ordered `snapshot|good|action_signature|belief_signature` steps.
    #[arg(long = "step", required = true)]
    pub steps: Vec<String>,
}

#[derive(ArgsMacro, Debug)]
pub struct CompileMemoryArgs {
    #[arg(long = "fact")]
    pub facts: Vec<String>,
    #[arg(long = "decision")]
    pub decisions: Vec<String>,
    #[arg(long = "failure")]
    pub failures: Vec<String>,
    #[arg(long = "constraint")]
    pub constraints: Vec<String>,
    #[arg(long = "open-question")]
    pub open_questions: Vec<String>,
    #[arg(long = "source-ref")]
    pub source_refs: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
}
