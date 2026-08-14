use async_trait::async_trait;
use genos_core::{AgentEvent, AgentSnapshot};

#[async_trait]
pub trait EventStore: Send + Sync {
    async fn append(&self, event: AgentEvent) -> anyhow::Result<()>;
    async fn stream(&self, branch_id: Option<String>) -> anyhow::Result<Vec<AgentEvent>>;
}

#[async_trait]
pub trait SnapshotStore: Send + Sync {
    async fn save_snapshot(&self, snapshot: AgentSnapshot) -> anyhow::Result<()>;
    async fn get_snapshot(&self, snapshot_id: String) -> anyhow::Result<Option<AgentSnapshot>>;
}
