use genos_core::{
    compare_genome_and_state, compare_snapshots, AgentGenome, AgentSnapshot, GenomeId,
    GenomeMutationChange, GenomeMutationMetadata, GenomeVersion, PhenotypeObservation,
};
use genos_eval::{
    pareto_select, MultiObjectiveBranchScore, ObjectiveDirection, ObjectiveScore, ParetoAssessment,
    ParetoObjective, RecombinedTraitTarget,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CohortControls {
    pub model: String,
    pub environment: String,
    pub evaluation_suite: String,
    pub seed_policy: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeredityCohortMember {
    pub treatment: String,
    pub baseline: AgentSnapshot,
    pub phenotype: PhenotypeObservation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExperienceEffect {
    pub trait_name: String,
    pub minimum: f64,
    pub maximum: f64,
    pub range: f64,
    pub member_values: Vec<(String, f64)>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeredityCohortReport {
    pub genome_id: GenomeId,
    pub controls: CohortControls,
    pub effects: Vec<ExperienceEffect>,
}

pub fn analyze_fixed_genome_cohort(
    controls: CohortControls,
    members: &[HeredityCohortMember],
) -> Result<HeredityCohortReport, String> {
    if members.len() < 2 {
        return Err("a heredity cohort requires at least two members".to_string());
    }
    let root = &members[0];
    for member in members {
        let genome = compare_genome_and_state(&root.baseline, &member.baseline);
        if !genome.same_genome {
            return Err("cohort baselines do not share one genome".to_string());
        }
        let baseline = compare_snapshots(&root.baseline, &member.baseline);
        if !baseline.same_logical_state {
            return Err(format!(
                "cohort baseline differs before treatment: {}",
                baseline.differing_fields.join(", ")
            ));
        }
        if member.phenotype.genome_id != root.baseline.genome.id {
            return Err("phenotype observation references another genome".to_string());
        }
        if member.phenotype.evaluation_suite != controls.evaluation_suite
            || member.phenotype.model != controls.model
            || member.phenotype.environment != controls.environment
        {
            return Err("phenotype observation violates cohort controls".to_string());
        }
    }

    let mut trait_names = members
        .iter()
        .flat_map(|member| {
            member
                .phenotype
                .traits
                .iter()
                .map(|value| value.name.clone())
        })
        .collect::<Vec<_>>();
    trait_names.sort();
    trait_names.dedup();
    let effects = trait_names
        .into_iter()
        .filter_map(|trait_name| {
            let member_values = members
                .iter()
                .filter_map(|member| {
                    member
                        .phenotype
                        .traits
                        .iter()
                        .find(|value| value.name == trait_name)
                        .map(|value| (member.treatment.clone(), value.value))
                })
                .collect::<Vec<_>>();
            if member_values.len() != members.len() {
                return None;
            }
            let minimum = member_values
                .iter()
                .map(|(_, value)| *value)
                .fold(f64::INFINITY, f64::min);
            let maximum = member_values
                .iter()
                .map(|(_, value)| *value)
                .fold(f64::NEG_INFINITY, f64::max);
            Some(ExperienceEffect {
                trait_name,
                minimum,
                maximum,
                range: maximum - minimum,
                member_values,
            })
        })
        .collect();
    Ok(HeredityCohortReport {
        genome_id: root.baseline.genome.id.clone(),
        controls,
        effects,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CanonicalAgentMetrics {
    pub accuracy: f64,
    pub cost: f64,
    pub tokens: f64,
    pub latency: f64,
    pub tool_calls: f64,
    pub risk: f64,
    pub hallucinations: f64,
    pub novelty: f64,
    pub success: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SelectionCandidate {
    pub genome_id: GenomeId,
    pub metrics: CanonicalAgentMetrics,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SelectionConstraints {
    pub max_cost: f64,
    pub max_risk: f64,
    pub max_hallucinations: f64,
    pub min_success: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ArtificialSelectionReport {
    pub eligible: Vec<GenomeId>,
    pub rejected: Vec<GenomeId>,
    pub pareto: Vec<ParetoAssessment>,
}

pub fn artificial_select(
    candidates: &[SelectionCandidate],
    constraints: &SelectionConstraints,
) -> ArtificialSelectionReport {
    let (eligible_candidates, rejected_candidates): (Vec<_>, Vec<_>) =
        candidates.iter().partition(|candidate| {
            candidate.metrics.cost <= constraints.max_cost
                && candidate.metrics.risk <= constraints.max_risk
                && candidate.metrics.hallucinations <= constraints.max_hallucinations
                && candidate.metrics.success >= constraints.min_success
        });
    let branches = eligible_candidates
        .iter()
        .map(|candidate| MultiObjectiveBranchScore {
            branch_id: genos_core::BranchId(candidate.genome_id.0.clone()),
            objectives: vec![
                ObjectiveScore {
                    objective: "accuracy".to_string(),
                    score: candidate.metrics.accuracy,
                },
                ObjectiveScore {
                    objective: "cost".to_string(),
                    score: candidate.metrics.cost,
                },
                ObjectiveScore {
                    objective: "tokens".to_string(),
                    score: candidate.metrics.tokens,
                },
                ObjectiveScore {
                    objective: "latency".to_string(),
                    score: candidate.metrics.latency,
                },
                ObjectiveScore {
                    objective: "tool_calls".to_string(),
                    score: candidate.metrics.tool_calls,
                },
                ObjectiveScore {
                    objective: "novelty".to_string(),
                    score: candidate.metrics.novelty,
                },
                ObjectiveScore {
                    objective: "success".to_string(),
                    score: candidate.metrics.success,
                },
            ],
        })
        .collect::<Vec<_>>();
    let directions = [
        ("accuracy", ObjectiveDirection::Maximize),
        ("cost", ObjectiveDirection::Minimize),
        ("tokens", ObjectiveDirection::Minimize),
        ("latency", ObjectiveDirection::Minimize),
        ("tool_calls", ObjectiveDirection::Minimize),
        ("novelty", ObjectiveDirection::Maximize),
        ("success", ObjectiveDirection::Maximize),
    ]
    .into_iter()
    .map(|(objective, direction)| ParetoObjective {
        objective: objective.to_string(),
        direction,
    })
    .collect::<Vec<_>>();
    ArtificialSelectionReport {
        eligible: eligible_candidates
            .iter()
            .map(|candidate| candidate.genome_id.clone())
            .collect(),
        rejected: rejected_candidates
            .iter()
            .map(|candidate| candidate.genome_id.clone())
            .collect(),
        pareto: pareto_select(&branches, &directions),
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingTraitMapping {
    pub genome_field: String,
    pub target: RecombinedTraitTarget,
}

pub fn breed_genomes(
    alice: &AgentGenome,
    bob: &AgentGenome,
    child_name: &str,
    mappings: &[BreedingTraitMapping],
) -> Result<AgentGenome, String> {
    if mappings.is_empty() {
        return Err("breeding requires at least one measured trait target".to_string());
    }
    let mut child = alice.clone();
    child.id = GenomeId::new();
    child.parent_genome = None;
    child.parent_genomes = vec![alice.id.clone(), bob.id.clone()];
    child.identity.name = child_name.to_string();
    child.version = GenomeVersion("0.1.0".to_string());
    let mut changes = Vec::new();
    for mapping in mappings {
        let target = mapping.target.target as f32;
        if !(0.0..=1.0).contains(&target) {
            return Err(format!(
                "target for {} is outside 0..=1",
                mapping.genome_field
            ));
        }
        let previous_value = match mapping.genome_field.as_str() {
            "cognition.exploration" => std::mem::replace(&mut child.cognition.exploration, target),
            "cognition.risk_tolerance" => {
                std::mem::replace(&mut child.cognition.risk_tolerance, target)
            }
            "cognition.verification_threshold" => {
                std::mem::replace(&mut child.cognition.verification_threshold, target)
            }
            field => return Err(format!("unsupported breeding target {field}")),
        };
        changes.push(GenomeMutationChange {
            field: mapping.genome_field.clone(),
            previous_value,
            new_value: target,
        });
    }
    child.mutation = Some(GenomeMutationMetadata { changes });
    child.inferred_traits.clear();
    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{ObservedTrait, PhenotypeObservation};
    use genos_eval::TraitEstimate;

    fn phenotype(snapshot: &AgentSnapshot, treatment: &str, value: f64) -> HeredityCohortMember {
        HeredityCohortMember {
            treatment: treatment.to_string(),
            baseline: snapshot.clone(),
            phenotype: PhenotypeObservation {
                genome_id: snapshot.genome.id.clone(),
                evaluation_suite: "suite-v1".to_string(),
                model: "model-a".to_string(),
                environment: "sandbox".to_string(),
                measured_at: chrono::Utc::now(),
                traits: vec![ObservedTrait {
                    name: "verification".to_string(),
                    value,
                    confidence: 0.9,
                    observations: 50,
                    method: "tasks".to_string(),
                    evidence: vec![format!("eval:{treatment}")],
                }],
            },
        }
    }

    #[test]
    fn fixed_genome_cohort_measures_experience_range() {
        let parent = crate::test_support::snapshot();
        let a = genos_core::fork_snapshot(&parent);
        let b = genos_core::fork_snapshot(&parent);
        let controls = CohortControls {
            model: "model-a".to_string(),
            environment: "sandbox".to_string(),
            evaluation_suite: "suite-v1".to_string(),
            seed_policy: "paired".to_string(),
        };
        let report = analyze_fixed_genome_cohort(
            controls,
            &[
                phenotype(&a, "development", 0.8),
                phenotype(&b, "research", 0.6),
            ],
        )
        .unwrap();
        assert!((report.effects[0].range - 0.2).abs() < 1e-9);
    }

    #[test]
    fn breeding_records_both_parents_and_starts_without_inferred_claims() {
        let alice = crate::test_support::snapshot().genome;
        let mut bob = alice.clone();
        bob.id = GenomeId::new();
        let estimate = |mean| TraitEstimate {
            trait_name: "exploration".to_string(),
            mean,
            standard_error: 0.02,
            sample_size: 100,
            evaluation_suite: "traits-v1".to_string(),
        };
        let target =
            genos_eval::recombine_measured_trait(estimate(0.9), estimate(0.4), 0.5).unwrap();
        let child = breed_genomes(
            &alice,
            &bob,
            "charlie",
            &[BreedingTraitMapping {
                genome_field: "cognition.exploration".to_string(),
                target,
            }],
        )
        .unwrap();
        assert_eq!(child.parent_genomes, vec![alice.id, bob.id]);
        assert_eq!(child.identity.name, "charlie");
        assert_eq!(child.cognition.exploration, 0.65);
        assert!(child.inferred_traits.is_empty());
    }

    #[test]
    fn safety_constraints_run_before_pareto_selection() {
        let candidate = |id: &str, risk: f64| SelectionCandidate {
            genome_id: GenomeId(id.to_string()),
            metrics: CanonicalAgentMetrics {
                accuracy: 0.9,
                cost: 1.0,
                tokens: 100.0,
                latency: 10.0,
                tool_calls: 2.0,
                risk,
                hallucinations: 0.01,
                novelty: 0.5,
                success: 0.9,
            },
        };
        let report = artificial_select(
            &[candidate("safe", 0.1), candidate("unsafe", 0.9)],
            &SelectionConstraints {
                max_cost: 2.0,
                max_risk: 0.2,
                max_hallucinations: 0.05,
                min_success: 0.8,
            },
        );
        assert_eq!(report.eligible, vec![GenomeId("safe".to_string())]);
        assert_eq!(report.rejected, vec![GenomeId("unsafe".to_string())]);
    }
}
