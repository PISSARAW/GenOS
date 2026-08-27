use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CostSchema {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub tool_call_count: u64,
    pub storage_bytes: u64,
    pub wall_time_ms: u64,
}

impl CostSchema {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, other: &CostSchema) {
        self.prompt_tokens += other.prompt_tokens;
        self.completion_tokens += other.completion_tokens;
        self.tool_call_count += other.tool_call_count;
        self.storage_bytes += other.storage_bytes;
        self.wall_time_ms += other.wall_time_ms;
    }
}
