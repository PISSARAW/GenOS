use crate::{AgentGenome, GenomeId};
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
}
