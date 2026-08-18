use crate::{AgentGenome, GenomeId, GenomeMutationChange, GenomeMutationMetadata};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObservedTrait {
    pub name: String,
    pub value: f64,
    pub confidence: f64,
    pub observations: u64,
    pub method: String,
    #[serde(default)]
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PhenotypeObservation {
    pub genome_id: GenomeId,
    pub evaluation_suite: String,
    pub model: String,
    pub environment: String,
    pub measured_at: DateTime<Utc>,
    pub traits: Vec<ObservedTrait>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TraitDivergence {
    pub trait_name: String,
    pub expected: f64,
    pub observed: f64,
    pub absolute_delta: f64,
    pub tolerance: f64,
    pub diverged: bool,
}

pub fn measure_divergence(
    trait_name: impl Into<String>,
    expected: f64,
    observed: f64,
    tolerance: f64,
) -> TraitDivergence {
    let absolute_delta = (expected - observed).abs();
    TraitDivergence {
        trait_name: trait_name.into(),
        expected,
        observed,
        absolute_delta,
        tolerance,
        diverged: absolute_delta > tolerance,
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TraitClaimStatus {
    Candidate,
    Replicated,
    Disputed,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HeritabilityStatus {
    Unknown,
    Candidate,
    Supported,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeritabilityEvidence {
    pub status: HeritabilityStatus,
    pub estimate: Option<f64>,
    #[serde(default)]
    pub descendant_cohorts: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InferredGenomeTraitClaim {
    pub trait_name: String,
    pub estimate: f64,
    pub confidence: f64,
    pub observations: u64,
    pub inference_method: String,
    pub status: TraitClaimStatus,
    #[serde(default)]
    pub contexts: Vec<String>,
    pub evidence: Vec<String>,
    pub heritability: HeritabilityEvidence,
}

pub fn infer_trait_claim(
    observations: &[PhenotypeObservation],
    trait_name: &str,
) -> Option<InferredGenomeTraitClaim> {
    let matching = observations
        .iter()
        .filter_map(|observation| {
            observation
                .traits
                .iter()
                .find(|trait_value| trait_value.name == trait_name)
                .map(|trait_value| (observation, trait_value))
        })
        .collect::<Vec<_>>();
    if matching.is_empty() {
        return None;
    }
    let total_observations = matching
        .iter()
        .map(|(_, value)| value.observations)
        .sum::<u64>();
    let weighted = matching
        .iter()
        .map(|(_, value)| value.value * value.observations as f64)
        .sum::<f64>()
        / total_observations as f64;
    let confidence = matching
        .iter()
        .map(|(_, value)| value.confidence * value.observations as f64)
        .sum::<f64>()
        / total_observations as f64;
    let mut contexts = matching
        .iter()
        .map(|(observation, _)| {
            format!(
                "{}|{}|{}",
                observation.evaluation_suite, observation.model, observation.environment
            )
        })
        .collect::<Vec<_>>();
    contexts.sort();
    contexts.dedup();
    let mut evidence = matching
        .iter()
        .flat_map(|(_, value)| value.evidence.clone())
        .collect::<Vec<_>>();
    evidence.sort();
    evidence.dedup();
    Some(InferredGenomeTraitClaim {
        trait_name: trait_name.to_string(),
        estimate: weighted,
        confidence,
        observations: total_observations,
        inference_method: "observation_weighted_mean".to_string(),
        status: if contexts.len() >= 2 {
            TraitClaimStatus::Replicated
        } else {
            TraitClaimStatus::Candidate
        },
        contexts,
        evidence,
        heritability: HeritabilityEvidence {
            status: HeritabilityStatus::Unknown,
            estimate: None,
            descendant_cohorts: vec![],
        },
    })
}

pub fn attach_inferred_trait(genome: &mut AgentGenome, claim: InferredGenomeTraitClaim) {
    if let Some(existing) = genome
        .inferred_traits
        .iter_mut()
        .find(|existing| existing.trait_name == claim.trait_name)
    {
        *existing = claim;
    } else {
        genome.inferred_traits.push(claim);
    }
}

pub fn record_heritability(
    claim: &mut InferredGenomeTraitClaim,
    estimate: f64,
    descendant_cohorts: Vec<String>,
) -> Result<(), String> {
    if !(0.0..=1.0).contains(&estimate) {
        return Err("heritability estimate must be between 0 and 1".to_string());
    }
    if descendant_cohorts.is_empty() {
        return Err("heritability requires descendant cohort evidence".to_string());
    }
    claim.heritability = HeritabilityEvidence {
        status: HeritabilityStatus::Supported,
        estimate: Some(estimate),
        descendant_cohorts,
    };
    Ok(())
}

/// Promote a replicated inferred claim into executable configuration by
/// creating a new genome. The explicit field mapping prevents semantic guesses
/// such as treating risk aversion as risk tolerance without author intent.
pub fn promote_inferred_trait(
    genome: &AgentGenome,
    trait_name: &str,
    genome_field: &str,
) -> Result<AgentGenome, String> {
    let claim = genome
        .inferred_traits
        .iter()
        .find(|claim| claim.trait_name == trait_name)
        .ok_or_else(|| format!("unknown inferred trait {trait_name}"))?;
    if claim.status != TraitClaimStatus::Replicated {
        return Err(format!("trait {trait_name} is not replicated"));
    }
    let value = claim.estimate as f32;
    if !(0.0..=1.0).contains(&value) {
        return Err(format!("trait estimate {value} is outside 0..=1"));
    }
    let mut child = genome.clone();
    child.id = GenomeId::new();
    child.parent_genome = Some(genome.id.clone());
    child.parent_genomes = vec![genome.id.clone()];
    child.breeding = None;
    let previous_value = if let Some(drive_name) = genome_field.strip_prefix("cognition.drives.") {
        let prev = child.cognition.drives.get(drive_name).copied().unwrap_or(0.5);
        child.cognition.drives.insert(drive_name.to_string(), value);
        prev
    } else {
        return Err(format!("unsupported promotion target {genome_field}"));
    };
    child.mutation = Some(GenomeMutationMetadata {
        changes: vec![GenomeMutationChange {
            field: genome_field.to_string(),
            previous_value,
            new_value: value,
        }],
    });
    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_contexts_create_a_replicated_claim() {
        let genome_id = GenomeId("g1".to_string());
        let observation = |environment: &str, value: f64| PhenotypeObservation {
            genome_id: genome_id.clone(),
            evaluation_suite: "risk-v1".to_string(),
            model: "model-a".to_string(),
            environment: environment.to_string(),
            measured_at: Utc::now(),
            traits: vec![ObservedTrait {
                name: "risk_aversion".to_string(),
                value,
                confidence: 0.9,
                observations: 100,
                method: "paired_tasks".to_string(),
                evidence: vec![format!("eval:{environment}")],
            }],
        };
        let claim = infer_trait_claim(
            &[observation("dev", 0.8), observation("prod", 0.82)],
            "risk_aversion",
        )
        .unwrap();
        assert_eq!(claim.status, TraitClaimStatus::Replicated);
        assert_eq!(claim.observations, 200);
        assert!((claim.estimate - 0.81).abs() < 1e-9);
        assert_eq!(claim.heritability.status, HeritabilityStatus::Unknown);
    }

    #[test]
    fn divergence_uses_an_explicit_tolerance() {
        let report = measure_divergence("verification", 0.95, 0.82, 0.05);
        assert!(report.diverged);
    }

    #[test]
    fn heritability_requires_descendant_evidence() {
        let mut claim = InferredGenomeTraitClaim {
            trait_name: "verification".to_string(),
            estimate: 0.8,
            confidence: 0.9,
            observations: 200,
            inference_method: "test".to_string(),
            status: TraitClaimStatus::Replicated,
            contexts: vec!["a".to_string(), "b".to_string()],
            evidence: vec!["eval:1".to_string()],
            heritability: HeritabilityEvidence {
                status: HeritabilityStatus::Unknown,
                estimate: None,
                descendant_cohorts: vec![],
            },
        };
        assert!(record_heritability(&mut claim, 0.7, vec![]).is_err());
        record_heritability(&mut claim, 0.7, vec!["cohort:children".to_string()]).unwrap();
        assert_eq!(claim.heritability.status, HeritabilityStatus::Supported);
    }
}
