use async_trait::async_trait;
use genos_core::{AgentState, BranchId, SnapshotId, WorldId};
use genos_world::WorldProvider;
use serde::{Deserialize, Serialize};

mod temporal;
pub use temporal::*;
mod branch_evolution;
pub use branch_evolution::*;
mod causal_replay;
pub use causal_replay::*;
mod experiment;
pub use experiment::*;
mod incident;
pub use incident::*;
mod scientific;
pub use scientific::*;
mod security_coevolution;
pub use security_coevolution::*;
mod bug_investigation;
pub use bug_investigation::*;
mod evolution;
pub use evolution::*;
mod reproducibility;
pub use reproducibility::*;
mod capsules;
pub use capsules::*;
mod cognitive_merge;
pub use cognitive_merge::*;

#[cfg(test)]
pub(crate) mod test_support {
    pub fn snapshot() -> genos_core::AgentSnapshot {
        use genos_core::*;
        let genome_id = GenomeId::new();
        let branch_id = BranchId::new();
        let world_id = WorldId::new();
        AgentSnapshot {
            snapshot_id: SnapshotId::new(),
            agent_id: AgentId::new(),
            branch_id: branch_id.clone(),
            branch_metadata: BranchMetadata::default(),
            genome: AgentGenome {
                id: genome_id.clone(),
                parent_genome: None,
                parent_genomes: vec![],
                mutation: None,
                version: GenomeVersion("0.1.0".to_string()),
                identity: Identity {
                    name: "test".to_string(),
                    role: "agent".to_string(),
                },
                cognition: CognitionConfig {
                    exploration: 0.7,
                    risk_tolerance: 0.25,
                    verification_threshold: 0.8,
                    planning_depth: 4,
                },
                objectives: vec![],
                policies: vec![],
                capabilities: vec![],
                memory_policy: MemoryPolicy {
                    working_max_items: 10,
                    episodic_enabled: true,
                    semantic_enabled: true,
                },
                model_policy: ModelPolicy {
                    strategy: "test".to_string(),
                    preferred_providers: vec![],
                    allow_local: true,
                },
                tool_policy: ToolPolicy {
                    permissions: vec![],
                },
                inferred_traits: vec![],
                breeding: None,
            },
            state: AgentState {
                genome: GenomeRef {
                    genome_id,
                    version: "0.1.0".to_string(),
                },
                working_memory: WorkingMemory { items: vec![] },
                semantic_memory: SemanticMemory { refs: vec![] },
                episodic_memory: EpisodicMemory { refs: vec![] },
                memories: vec![],
                tool_outputs: vec![],
                beliefs: vec![],
                active_goals: vec![],
                world_id: world_id.clone(),
                event_cursor: EventCursor {
                    branch_id,
                    sequence: 0,
                    last_event_id: None,
                },
                execution: ExecutionMetadata {
                    step: 0,
                    last_model_provider: None,
                },
                artifact_refs: vec![],
            },
            world_id,
            tool_state: ToolState {
                active_tools: vec![],
            },
            runtime_metadata: RuntimeMetadata {
                runtime_version: "test".to_string(),
                budget_steps_remaining: 10,
            },
            created_at: chrono::Utc::now(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct StepResult {
    pub next_state: AgentState,
    pub done: bool,
}

#[async_trait]
pub trait AgentRuntime: Send + Sync {
    async fn step(&self, state: AgentState, world_id: WorldId) -> anyhow::Result<StepResult>;
}

#[derive(Clone, Debug)]
pub struct WorkspaceEdit {
    pub relative_path: String,
    pub contents: String,
}

#[derive(Clone, Debug)]
pub struct CodeBranchPlan {
    pub branch_id: BranchId,
    pub label: String,
    pub hypothesis: String,
    pub edits: Vec<WorkspaceEdit>,
    pub test_command: String,
    pub score_on_success: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CodeBranchOutcome {
    pub branch_id: BranchId,
    pub label: String,
    pub hypothesis: String,
    pub world_id: WorldId,
    pub tests_passed: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub files_changed: usize,
    pub diff_summary: String,
    pub score: f64,
}

/// Execute independent code strategies from one workspace snapshot. A failed
/// branch is retained in the outcomes and does not prevent sibling execution.
pub async fn run_code_experiment<P: WorldProvider>(
    provider: &P,
    base_world: &WorldId,
    base_snapshot: &SnapshotId,
    plans: impl IntoIterator<Item = CodeBranchPlan>,
) -> anyhow::Result<Vec<CodeBranchOutcome>> {
    let mut outcomes = Vec::new();
    for plan in plans {
        let world_id = provider.fork(base_snapshot.clone()).await?;
        for edit in &plan.edits {
            provider
                .write_file(&world_id, &edit.relative_path, &edit.contents)
                .await?;
        }
        let execution = provider
            .execute(world_id.clone(), &plan.test_command)
            .await?;
        let diff = provider.diff(base_world.clone(), world_id.clone()).await?;
        let tests_passed = execution.exit_code == 0;
        outcomes.push(CodeBranchOutcome {
            branch_id: plan.branch_id,
            label: plan.label,
            hypothesis: plan.hypothesis,
            world_id,
            tests_passed,
            exit_code: execution.exit_code,
            stdout: execution.stdout,
            stderr: execution.stderr,
            files_changed: diff.files_changed,
            diff_summary: format!("{} file(s) changed", diff.files_changed),
            score: if tests_passed {
                plan.score_on_success
            } else {
                0.0
            },
        });
    }
    Ok(outcomes)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationKind {
    Tests,
    Benchmark,
    Fuzzing,
    DataMigration,
}

#[derive(Clone, Debug)]
pub struct VerificationPlan {
    pub kind: VerificationKind,
    pub command: String,
}

#[derive(Clone, Debug)]
pub struct LongRunningBranchPlan {
    pub branch_id: BranchId,
    pub label: String,
    pub hypothesis: String,
    pub edits: Vec<WorkspaceEdit>,
    pub verifications: Vec<VerificationPlan>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerificationOutcome {
    pub kind: VerificationKind,
    pub exit_code: i32,
    pub passed: bool,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LongRunningBranchOutcome {
    pub branch_id: BranchId,
    pub label: String,
    pub hypothesis: String,
    pub world_id: WorldId,
    pub verifications: Vec<VerificationOutcome>,
    pub files_changed: usize,
}

/// Run a full verification pipeline in an already-selected lineage snapshot.
/// Every stage is recorded; failure remains branch-local and stops only that
/// branch's remaining stages.
pub async fn run_long_branch<P: WorldProvider>(
    provider: &P,
    base_world: &WorldId,
    parent_snapshot: &SnapshotId,
    plan: LongRunningBranchPlan,
) -> anyhow::Result<LongRunningBranchOutcome> {
    let world_id = provider.fork(parent_snapshot.clone()).await?;
    for edit in &plan.edits {
        provider
            .write_file(&world_id, &edit.relative_path, &edit.contents)
            .await?;
    }
    let mut verifications = Vec::new();
    for verification in plan.verifications {
        let execution = provider
            .execute(world_id.clone(), &verification.command)
            .await?;
        let passed = execution.exit_code == 0;
        verifications.push(VerificationOutcome {
            kind: verification.kind,
            exit_code: execution.exit_code,
            passed,
            stdout: execution.stdout,
            stderr: execution.stderr,
        });
        if !passed {
            break;
        }
    }
    let diff = provider.diff(base_world.clone(), world_id.clone()).await?;
    Ok(LongRunningBranchOutcome {
        branch_id: plan.branch_id,
        label: plan.label,
        hypothesis: plan.hypothesis,
        world_id,
        verifications,
        files_changed: diff.files_changed,
    })
}
