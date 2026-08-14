use async_trait::async_trait;
use genos_core::{AgentState, WorldId};

#[derive(Clone, Debug)]
pub struct StepResult {
    pub next_state: AgentState,
    pub done: bool,
}

#[async_trait]
pub trait AgentRuntime: Send + Sync {
    async fn step(&self, state: AgentState, world_id: WorldId) -> anyhow::Result<StepResult>;
}
