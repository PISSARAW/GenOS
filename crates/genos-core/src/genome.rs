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
pub struct Locus {
    pub gene_name: String,
    pub value: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum RecombinationStrategy {
    HomologousRecombination,
    GeneConversion { dominant_parent: String },
    NonHomologousEndJoining { error_rate: f32 },
    SiteSpecific { target_genes: Vec<String> },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Chromosome {
    pub name: String,
    pub loci: Vec<Locus>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitionConfig {
    #[serde(default)]
    pub chromosomes: Vec<Chromosome>,
    pub planning_depth: u32,
    #[serde(default)]
    pub regulators: Vec<RegulatorGene>,
}

impl CognitionConfig {
    pub fn get_drive(&self, drive_name: &str) -> Option<f32> {
        for chrom in &self.chromosomes {
            for locus in &chrom.loci {
                if locus.gene_name == drive_name {
                    return Some(locus.value);
                }
            }
        }
        None
    }

    pub fn set_drive(&mut self, drive_name: &str, value: f32) -> bool {
        for chrom in &mut self.chromosomes {
            for locus in &mut chrom.loci {
                if locus.gene_name == drive_name {
                    locus.value = value;
                    return true;
                }
            }
        }
        false
    }

    pub fn clone_drives(&self) -> std::collections::BTreeMap<String, f32> {
        let mut map = std::collections::BTreeMap::new();
        for chrom in &self.chromosomes {
            for locus in &chrom.loci {
                map.insert(locus.gene_name.clone(), locus.value);
            }
        }
        map
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RegulatorGene {
    pub name: String,
    pub condition: String,
    pub modulated_drive: String,
    pub modulation_offset: f32,
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
    #[serde(default)]
    pub breeding: Option<GenomeBreedingMetadata>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BreedingStatus {
    UntestedCandidate,
    Validated,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeBreedingTarget {
    pub trait_name: String,
    pub genome_field: String,
    pub target: f64,
    pub parent_a_weight: f64,
    pub evaluation_suite: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeBreedingMetadata {
    pub status: BreedingStatus,
    pub targets: Vec<GenomeBreedingTarget>,
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

pub fn mutate_cognition(
    parent: &AgentGenome,
    drive_changes: std::collections::BTreeMap<String, f32>,
) -> AgentGenome {
    let mut child = parent.clone();
    child.id = GenomeId::new();
    child.parent_genome = Some(parent.id.clone());
    child.parent_genomes = vec![parent.id.clone()];
    child.breeding = None;
    let mut changes = Vec::new();

    for (drive_name, new_value) in drive_changes {
        let previous_value = child.cognition.get_drive(&drive_name).unwrap_or(0.5); // Default to 0.5 if not found

        changes.push(GenomeMutationChange {
            field: format!("cognition.drives.{}", drive_name),
            previous_value,
            new_value,
        });
        if !child.cognition.set_drive(&drive_name, new_value) {
            // If drive wasn't found in any chromosome, add it to a 'default' chromosome
            if child.cognition.chromosomes.is_empty() {
                child.cognition.chromosomes.push(Chromosome { name: "C1".to_string(), loci: vec![] });
            }
            child.cognition.chromosomes[0].loci.push(Locus { gene_name: drive_name, value: new_value });
        }
    }
    
    child.mutation = Some(GenomeMutationMetadata { changes });
    child
}

#[cfg(test)]
mod tests {
    use super::*;

    fn genome(exploration: f32) -> AgentGenome {
        AgentGenome {
            id: GenomeId::new(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            breeding: None,
            version: GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: "test-agent".to_string(),
                role: "tester".to_string(),
            },
            cognition: CognitionConfig {
                chromosomes: vec![
                    Chromosome {
                        name: "C1".to_string(),
                        loci: vec![
                            Locus { gene_name: "exploration".to_string(), value: exploration },
                            Locus { gene_name: "risk_tolerance".to_string(), value: 0.25 },
                            Locus { gene_name: "verification_threshold".to_string(), value: 0.5 },
                        ],
                    }
                ],
                planning_depth: 4,
                regulators: vec![],
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
        let mut changes1 = std::collections::BTreeMap::new();
        changes1.insert("exploration".to_string(), 0.6);
        let g1 = mutate_cognition(&parent, changes1);
        
        let mut changes2 = std::collections::BTreeMap::new();
        changes2.insert("exploration".to_string(), 0.4);
        let g2 = mutate_cognition(&parent, changes2);
        
        assert_eq!(g1.parent_genome, Some(parent.id.clone()));
        assert_eq!(g2.parent_genome, Some(parent.id.clone()));
        assert_eq!(g1.cognition.get_drive("exploration").unwrap(), 0.6);
        assert_eq!(g2.cognition.get_drive("exploration").unwrap(), 0.4);
        assert_eq!(g1.mutation.as_ref().unwrap().changes[0].previous_value, 0.5);
    }

    #[test]
    fn multi_field_mutation_records_each_change() {
        let parent = genome(0.8);
        let mut changes = std::collections::BTreeMap::new();
        changes.insert("exploration".to_string(), 0.95);
        changes.insert("risk_tolerance".to_string(), 0.15);
        let child = mutate_cognition(&parent, changes);
        assert_eq!(child.cognition.get_drive("exploration").unwrap(), 0.95);
        assert_eq!(child.cognition.get_drive("risk_tolerance").unwrap(), 0.15);
        assert_eq!(child.mutation.as_ref().unwrap().changes.len(), 2);
    }

    #[test]
    fn mutation_is_reversible_by_restarting_from_the_original_genome() {
        let g0 = genome(0.5);
        let mut ch1 = std::collections::BTreeMap::new();
        ch1.insert("exploration".to_string(), 0.6);
        let g1 = mutate_cognition(&g0, ch1);
        
        let mut ch2 = std::collections::BTreeMap::new();
        ch2.insert("exploration".to_string(), 0.7);
        let g2 = mutate_cognition(&g1, ch2);

        let mut ch3 = std::collections::BTreeMap::new();
        ch3.insert("exploration".to_string(), 0.4);
        let restarted = mutate_cognition(&g0, ch3);

        assert_eq!(g1.parent_genome, Some(g0.id.clone()));
        assert_eq!(g2.parent_genome, Some(g1.id.clone()));
        assert_eq!(restarted.parent_genome, Some(g0.id.clone()));
        assert_eq!(g0.cognition.get_drive("exploration").unwrap(), 0.5);
        assert_eq!(restarted.cognition.get_drive("exploration").unwrap(), 0.4);
        assert_ne!(restarted.id, g1.id);
    }
}
