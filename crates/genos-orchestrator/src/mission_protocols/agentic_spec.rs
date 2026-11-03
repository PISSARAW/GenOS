//! Profil multi-agents explicite ; les sorties du modèle ne créent aucune permission.
use super::{agentic_source::SourceData, llm_contract::TextContract};
use genos_api::native_inference::{Generation, ProviderConfig};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const SCHEMA: &str = "genos.rust-agentic-mission/v1";
pub const CONFIG_SCHEMA: &str = "genos.rust-agentic-config/v1";
pub const POLICY: &[u8] = b"genos.rust.agentic/v1:explicit-dag:provider-tool-calls:source-snapshot:private-cas:bounded-effects:contract-only";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all="snake_case")]
pub enum ToolKind { ReadSource, ListSources, WriteArtifact, ReadArtifact }

impl ToolKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadSource=>"read_source", Self::ListSources=>"list_sources",
            Self::WriteArtifact=>"write_artifact", Self::ReadArtifact=>"read_artifact",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgenticLimits { pub tokens:u64, pub model_calls:u64, pub tool_calls:u64, pub wall_ms:u64 }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentConfig {
    pub id:String,
    pub instruction:String,
    #[serde(default)]
    pub depends_on:Vec<String>,
    #[serde(default)]
    pub tools:Vec<ToolKind>,
    #[serde(default)]
    pub artifact_names:Vec<String>,
    pub max_turns:u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgenticConfig {
    pub schema:String,
    #[serde(default="sequential_parallelism")]
    pub max_parallel_agents:u32,
    pub provider:ProviderConfig,
    pub generation:Generation,
    pub agents:Vec<AgentConfig>,
    #[serde(default)]
    pub documents:Vec<String>,
    pub contract:TextContract,
    pub limits:AgenticLimits,
    pub max_input_tokens:u64,
    pub turn_timeout_ms:u64,
}

fn sequential_parallelism() -> u32 { 1 }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgenticSpec {
    pub schema:String,
    pub mission_id:String,
    pub workspace:PathBuf,
    pub mission:String,
    pub config:AgenticConfig,
    pub source:SourceData,
    pub source_hash:String,
    pub timeout_ms:u64,
    pub env_hash:String,
}

#[path="agentic_validation.rs"]
mod validation;

impl AgenticSpec {
    pub fn validate(&self) -> Result<(),String> { validation::specification(self) }
    pub fn agent(&self, id:&str) -> Result<&AgentConfig,String> {
        self.config.agents.iter().find(|agent|agent.id==id).ok_or_else(||"AGENTIC_AGENT_NOT_ADMITTED".into())
    }
}

impl AgenticConfig {
    pub fn validate(&self) -> Result<(),String> { validation::configuration(self) }
}

pub fn valid_name(name:&str) -> bool {
    !name.is_empty() && name.len()<=64 && name.bytes().all(|byte|byte.is_ascii_alphanumeric() || byte==b'_' || byte==b'-')
}
