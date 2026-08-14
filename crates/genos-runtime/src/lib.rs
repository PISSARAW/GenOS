use async_trait::async_trait;
use genos_core::{AgentState, BranchId, SnapshotId, WorldId};
use genos_world::WorldProvider;
use serde::{Deserialize, Serialize};

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
            score: if tests_passed { plan.score_on_success } else { 0.0 },
        });
    }
    Ok(outcomes)
}
