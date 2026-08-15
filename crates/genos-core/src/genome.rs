use crate::ids::GenomeId;
use crate::phenotype::InferredGenomeTraitClaim;
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
    #[serde(default = "default_risk_tolerance")]
    pub risk_tolerance: f32,
    pub verification_threshold: f32,
    pub planning_depth: u32,
}

fn default_risk_tolerance() -> f32 {
    0.5
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
    pub parent_genomes: Vec<GenomeId>,
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
    #[serde(default)]
    pub inferred_traits: Vec<InferredGenomeTraitClaim>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeMutationMetadata {
    pub changes: Vec<GenomeMutationChange>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeMutationChange {
    pub field: String,
    pub previous_value: f32,
    pub new_value: f32,
}

/// Derive a genome by changing only its exploration configuration.
///
/// This is genetic lineage, not execution history: the parent genome is never
/// modified and may be used later to start an independent mutation lineage.
pub fn mutate_exploration(parent: &AgentGenome, exploration: f32) -> AgentGenome {
    mutate_cognition(parent, Some(exploration), None)
}

pub fn mutate_cognition(
    parent: &AgentGenome,
    exploration: Option<f32>,
    risk_tolerance: Option<f32>,
) -> AgentGenome {
    let mut child = parent.clone();
    child.id = GenomeId::new();
    child.parent_genome = Some(parent.id.clone());
    child.parent_genomes = vec![parent.id.clone()];
    let mut changes = Vec::new();
    if let Some(value) = exploration {
        changes.push(GenomeMutationChange {
            field: "cognition.exploration".to_string(),
            previous_value: parent.cognition.exploration,
            new_value: value,
        });
        child.cognition.exploration = value;
    }
    if let Some(value) = risk_tolerance {
        changes.push(GenomeMutationChange {
            field: "cognition.risk_tolerance".to_string(),
            previous_value: parent.cognition.risk_tolerance,
            new_value: value,
        });
        child.cognition.risk_tolerance = value;
    }
    child.mutation = Some(GenomeMutationMetadata { changes });
    child
}

#[cfg(test)]
mod tests {
    use super::*;

    fn genome(exploration: f32) -> AgentGenome {
        AgentGenome {
            id: GenomeId("G0".to_string()),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            version: GenomeVersion("v0".to_string()),
            identity: Identity {
                name: "test".to_string(),
                role: "agent".to_string(),
            },
            cognition: CognitionConfig {
                exploration,
                risk_tolerance: 0.25,
                verification_threshold: 0.5,
                planning_depth: 1,
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: MemoryPolicy {
                working_max_items: 1,
                episodic_enabled: false,
                semantic_enabled: false,
            },
            model_policy: ModelPolicy {
                strategy: "test".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: ToolPolicy {
                permissions: vec![],
            },
            inferred_traits: vec![],
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
        assert_eq!(g1.mutation.as_ref().unwrap().changes[0].previous_value, 0.5);
    }

    #[test]
    fn multi_field_mutation_records_each_change() {
        let parent = genome(0.8);
        let child = mutate_cognition(&parent, Some(0.95), Some(0.15));
        assert_eq!(child.cognition.exploration, 0.95);
        assert_eq!(child.cognition.risk_tolerance, 0.15);
        assert_eq!(child.mutation.as_ref().unwrap().changes.len(), 2);
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
