use crate::ids::GenomeId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenomeVersion(pub String);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Identity {
    pub name: String,
    pub role: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitionConfig {
    pub exploration: f32,
    pub verification_threshold: f32,
    pub planning_depth: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Objective {
    pub key: String,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Policy {
    pub key: String,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capability {
    pub name: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MemoryPolicy {
    pub working_max_items: u32,
    pub episodic_enabled: bool,
    pub semantic_enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelPolicy {
    pub strategy: String,
    pub preferred_providers: Vec<String>,
    pub allow_local: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolPermission {
    pub tool: String,
    pub scope: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolPolicy {
    pub permissions: Vec<ToolPermission>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentGenome {
    pub id: GenomeId,
    pub version: GenomeVersion,
    pub identity: Identity,
    pub cognition: CognitionConfig,
    pub objectives: Vec<Objective>,
    pub policies: Vec<Policy>,
    pub capabilities: Vec<Capability>,
    pub memory_policy: MemoryPolicy,
    pub model_policy: ModelPolicy,
    pub tool_policy: ToolPolicy,
}
