use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentDiff {
    pub genome_diff: Vec<DiffEntry>,
    pub state_diff: Vec<DiffEntry>,
    pub memory_diff: Vec<DiffEntry>,
    pub belief_diff: Vec<DiffEntry>,
    pub world_diff: Vec<DiffEntry>,
    pub event_summary: Vec<DiffEntry>,
    pub evaluation_diff: Vec<DiffEntry>,
}
