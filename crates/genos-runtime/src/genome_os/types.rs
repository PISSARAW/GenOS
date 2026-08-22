use async_trait::async_trait;
use genos_core::{AgentEvent, AgentWorldCapsule, BranchId};
use serde::{Deserialize, Serialize};

use crate::{BranchExperience, CognitiveMergeApplication, CognitiveMergeReport};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentGenerationLineage {
    pub agent_uri: String,
    pub generation: u64,
    pub generation_id: String,
}

impl AgentGenerationLineage {
    pub fn new(agent_uri: impl Into<String>, generation: u64) -> Result<Self, String> {
        let agent_uri = agent_uri.into().trim_end_matches('/').to_string();
        let name = agent_uri.strip_prefix("agent://").unwrap_or_default();
        if !uri_segment_is_safe(name) {
            return Err(
                "agent lineage URI must start with agent:// and contain a name".to_string(),
            );
        }
        Ok(Self {
            generation_id: format!("{agent_uri}/generation/{generation}"),
            agent_uri,
            generation,
        })
    }

    pub fn fork_id(&self, label: &str) -> Result<BranchId, String> {
        if !uri_segment_is_safe(label) {
            return Err("fork label must be non-empty and URI-safe".to_string());
        }
        Ok(BranchId(format!(
            "{}/fork/{}-{label}",
            self.generation_id, self.generation
        )))
    }
}

pub(crate) fn uri_segment_is_safe(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenomeOsForkPlan {
    pub label: String,
    pub hypothesis: String,
}

#[async_trait]
pub trait CounterfactualExperienceRunner: Send + Sync {
    async fn run_experience(&self, capsule: &AgentWorldCapsule)
        -> anyhow::Result<BranchExperience>;
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenomeOsForkOutcome {
    pub lineage_id: BranchId,
    pub initial_capsule: AgentWorldCapsule,
    pub terminal_capsule: AgentWorldCapsule,
    pub experience: BranchExperience,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenomeOsCycleReport {
    pub lineage: AgentGenerationLineage,
    pub state_s0: AgentWorldCapsule,
    pub state_s0_checkpoint_event: AgentEvent,
    pub forks: Vec<GenomeOsForkOutcome>,
    pub cognitive_merge: CognitiveMergeReport,
    pub merge_application: CognitiveMergeApplication,
    pub state_s1: AgentWorldCapsule,
}
