use async_trait::async_trait;
use genos_core::{AgentId, BranchId, SnapshotId, WorldId};

#[derive(Clone, Debug)]
pub struct WorldDiff {
    pub files_changed: usize,
}

#[derive(Clone, Debug)]
pub struct ExecuteResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait WorldProvider: Send + Sync {
    async fn create(&self, agent_id: AgentId, branch_id: BranchId) -> anyhow::Result<WorldId>;
    async fn snapshot(&self, world_id: WorldId) -> anyhow::Result<SnapshotId>;
    async fn fork(&self, snapshot_id: SnapshotId) -> anyhow::Result<WorldId>;
    async fn diff(&self, a: WorldId, b: WorldId) -> anyhow::Result<WorldDiff>;
    async fn execute(&self, world_id: WorldId, command: &str) -> anyhow::Result<ExecuteResult>;
    async fn inspect(&self, world_id: WorldId) -> anyhow::Result<String>;
    async fn destroy(&self, world_id: WorldId) -> anyhow::Result<()>;
}
