use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolInvocation {
    pub name: String,
    pub input: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: serde_json::Value,
}

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(&self, call: ToolInvocation) -> anyhow::Result<ToolResult>;
}

pub mod gateway;
pub use gateway::*;
