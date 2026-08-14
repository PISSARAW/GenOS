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
    #[serde(default)]
    pub parent_genome: Option<GenomeId>,
    #[serde(default)]
    pub mutation: Option<GenomeMutationMetadata>,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeMutationMetadata {
    pub field: String,
    pub previous_value: f32,
    pub new_value: f32,
}

/// Derive a genome by changing only its exploration configuration.
///
/// This is genetic lineage, not execution history: the parent genome is never
/// modified and may be used later to start an independent mutation lineage.
pub fn mutate_exploration(parent: &AgentGenome, exploration: f32) -> AgentGenome {
    let mut child = parent.clone();
    child.id = GenomeId::new();
    child.parent_genome = Some(parent.id.clone());
    child.mutation = Some(GenomeMutationMetadata {
        field: "cognition.exploration".to_string(),
        previous_value: parent.cognition.exploration,
        new_value: exploration,
    });
    child.cognition.exploration = exploration;
    child
}

#[cfg(test)]
mod tests {
    use super::*;

    fn genome(exploration: f32) -> AgentGenome {
        AgentGenome {
            id: GenomeId("G0".to_string()), parent_genome: None, mutation: None,
            version: GenomeVersion("v0".to_string()),
            identity: Identity { name: "test".to_string(), role: "agent".to_string() },
            cognition: CognitionConfig { exploration, verification_threshold: 0.5, planning_depth: 1 },
            objectives: vec![], policies: vec![], capabilities: vec![],
            memory_policy: MemoryPolicy { working_max_items: 1, episodic_enabled: false, semantic_enabled: false },
            model_policy: ModelPolicy { strategy: "test".to_string(), preferred_providers: vec![], allow_local: true },
            tool_policy: ToolPolicy { permissions: vec![] },
        }
    }

    #[test]
    fn exploration_mutations_keep_parent_and_metadata() {
        let parent = genome(0.5);
        let g1 = mutate_exploration(&parent, 0.6);
        let g2 = mutate_exploration(&parent, 0.4);
        assert_eq!(g1.parent_genome, Some(parent.id.clone()));
        assert_eq!(g2.parent_genome, Some(parent.id.clone()));
        assert_eq!(g1.cognition.exploration, 0.6);
        assert_eq!(g2.cognition.exploration, 0.4);
        assert_eq!(g1.mutation.as_ref().unwrap().previous_value, 0.5);
    }

    #[test]
    fn mutation_is_reversible_by_restarting_from_the_original_genome() {
        let g0 = genome(0.5);
        let g1 = mutate_exploration(&g0, 0.6);
        let g2 = mutate_exploration(&g1, 0.7);

        // Restarting from G0 does not rewind an execution timeline; it creates
        // a distinct genetic sibling of G1 with G0 as its own parent.
        let restarted = mutate_exploration(&g0, 0.4);

        assert_eq!(g1.parent_genome, Some(g0.id.clone()));
        assert_eq!(g2.parent_genome, Some(g1.id.clone()));
        assert_eq!(restarted.parent_genome, Some(g0.id.clone()));
        assert_eq!(g0.cognition.exploration, 0.5);
        assert_eq!(restarted.cognition.exploration, 0.4);
        assert_ne!(restarted.id, g1.id);
    }
}
