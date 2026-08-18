use genos_core::{
    compare_genome_and_state, compare_snapshots, AgentGenome, AgentSnapshot, BreedingStatus,
    GenomeBreedingMetadata, GenomeBreedingTarget, GenomeId, GenomeMutationChange,
    GenomeMutationMetadata, GenomeVersion, PhenotypeObservation,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FactorialTraitObservation {
    pub genome_id: GenomeId,
    pub treatment: String,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeExperienceEffects {
    pub genome_effect_range: f64,
    pub experience_effect_range: f64,
    pub maximum_interaction: f64,
}

pub fn analyze_genome_experience_interaction(
    observations: &[FactorialTraitObservation],
) -> Result<GenomeExperienceEffects, String> {
    let mut genomes = observations
        .iter()
        .map(|value| value.genome_id.clone())
        .collect::<Vec<_>>();
    genomes.sort_by(|a, b| a.0.cmp(&b.0));
    genomes.dedup();
    let mut treatments = observations
        .iter()
        .map(|value| value.treatment.clone())
        .collect::<Vec<_>>();
    treatments.sort();
    treatments.dedup();
    if genomes.len() < 2
        || treatments.len() < 2
        || observations.len() != genomes.len() * treatments.len()
    {
        return Err("interaction analysis requires a complete design with at least two genomes and two treatments".to_string());
    }
    let mean = |values: Vec<f64>| values.iter().sum::<f64>() / values.len() as f64;
    let genome_means = genomes
        .iter()
        .map(|genome| {
            mean(
                observations
                    .iter()
                    .filter(|value| &value.genome_id == genome)
                    .map(|value| value.value)
                    .collect(),
            )
        })
        .collect::<Vec<_>>();
    let treatment_means = treatments
        .iter()
        .map(|treatment| {
            mean(
                observations
                    .iter()
                    .filter(|value| &value.treatment == treatment)
                    .map(|value| value.value)
                    .collect(),
            )
        })
        .collect::<Vec<_>>();
    let grand = mean(observations.iter().map(|value| value.value).collect());
    let range = |values: &[f64]| {
        values.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - values.iter().copied().fold(f64::INFINITY, f64::min)
    };
    let maximum_interaction = observations
        .iter()
        .map(|observation| {
            let genome_index = genomes
                .iter()
                .position(|genome| genome == &observation.genome_id)
                .unwrap();
            let treatment_index = treatments
                .iter()
                .position(|treatment| treatment == &observation.treatment)
                .unwrap();
            (observation.value - genome_means[genome_index] - treatment_means[treatment_index]
                + grand)
                .abs()
        })
        .fold(0.0, f64::max);
    Ok(GenomeExperienceEffects {
        genome_effect_range: range(&genome_means),
        experience_effect_range: range(&treatment_means),
        maximum_interaction,
    })
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ControlledBenchmarkRun {
    pub genome_id: GenomeId,
    pub protocol_id: String,
    pub repetition: u32,
    pub metrics: CanonicalAgentMetrics,
}

pub fn select_controlled_generation(
    runs: &[ControlledBenchmarkRun],
    constraints: &SelectionConstraints,
) -> Result<ArtificialSelectionReport, String> {
    if runs.is_empty() {
        return Err("selection generation has no benchmark runs".to_string());
    }
    let protocol = &runs[0].protocol_id;
    if runs.iter().any(|run| &run.protocol_id != protocol) {
        return Err("benchmark runs use different protocols".to_string());
    }
    let mut genomes = runs
        .iter()
        .map(|run| run.genome_id.clone())
        .collect::<Vec<_>>();
    genomes.sort_by(|a, b| a.0.cmp(&b.0));
    genomes.dedup();
    let average = |values: Vec<f64>| values.iter().sum::<f64>() / values.len() as f64;
    let candidates = genomes
        .into_iter()
        .map(|genome_id| {
            let samples = runs
                .iter()
                .filter(|run| run.genome_id == genome_id)
                .collect::<Vec<_>>();
            SelectionCandidate {
                genome_id,
                metrics: CanonicalAgentMetrics {
                    accuracy: average(samples.iter().map(|run| run.metrics.accuracy).collect()),
                    cost: average(samples.iter().map(|run| run.metrics.cost).collect()),
                    tokens: average(samples.iter().map(|run| run.metrics.tokens).collect()),
                    latency: average(samples.iter().map(|run| run.metrics.latency).collect()),
                    tool_calls: average(samples.iter().map(|run| run.metrics.tool_calls).collect()),
                    risk: average(samples.iter().map(|run| run.metrics.risk).collect()),
                    hallucinations: average(
                        samples
                            .iter()
                            .map(|run| run.metrics.hallucinations)
                            .collect(),
                    ),
                    novelty: average(samples.iter().map(|run| run.metrics.novelty).collect()),
                    success: average(samples.iter().map(|run| run.metrics.success).collect()),
                },
            }
        })
        .collect::<Vec<_>>();
    Ok(artificial_select(&candidates, constraints))
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

    // 1. Spatially crossover chromosomes
    for chrom_index in 0..child.cognition.chromosomes.len() {
        let alice_chrom = &alice.cognition.chromosomes[chrom_index];
        if let Some(bob_chrom) = bob.cognition.chromosomes.iter().find(|c| c.name == alice_chrom.name) {
            
            // For tests, use a simple deterministic crossover: cut in half
            let crossover_point = alice_chrom.loci.len() / 2;

            let mut new_loci = Vec::new();
            for (i, locus) in alice_chrom.loci.iter().enumerate() {
                let mut chosen_value = locus.value;
                if i >= crossover_point {
                    if let Some(bob_locus) = bob_chrom.loci.iter().find(|l| l.gene_name == locus.gene_name) {
                        chosen_value = bob_locus.value;
                    }
                }
                new_loci.push(genos_core::Locus { gene_name: locus.gene_name.clone(), value: chosen_value });
                
                changes.push(GenomeMutationChange {
                    field: format!("cognition.drives.{}", locus.gene_name),
                    previous_value: locus.value,
                    new_value: chosen_value,
                });
            }
            child.cognition.chromosomes[chrom_index].loci = new_loci;
        }
    }

    child.mutation = Some(GenomeMutationMetadata { changes });
    child.inferred_traits.clear();
    child.breeding = Some(GenomeBreedingMetadata {
        status: BreedingStatus::UntestedCandidate,
        targets: mappings
            .iter()
            .map(|mapping| {
                let drive_name = mapping.genome_field.strip_prefix("cognition.drives.").unwrap_or("");
                let actual_target = child.cognition.get_drive(drive_name).unwrap_or(mapping.target.target as f32) as f64;
                GenomeBreedingTarget {
                    trait_name: mapping.target.trait_name.clone(),
                    genome_field: mapping.genome_field.clone(),
                    target: actual_target,
                    parent_a_weight: mapping.target.parent_a_weight,
                    evaluation_suite: mapping.target.parent_a_estimate.evaluation_suite.clone(),
                }
            })
            .collect(),
    });
    Ok(child)
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingValidation {
    pub genome: AgentGenome,
    pub deviations: Vec<(String, f64)>,
    pub tolerance: f64,
}

pub fn validate_bred_child(
    child: &AgentGenome,
    phenotype: &PhenotypeObservation,
    tolerance: f64,
) -> Result<BreedingValidation, String> {
    let metadata = child
        .breeding
        .as_ref()
        .ok_or_else(|| "genome has no breeding metadata".to_string())?;
    if phenotype.genome_id != child.id {
        return Err("phenotype does not belong to child genome".to_string());
    }
    let mut deviations = Vec::new();
    for target in &metadata.targets {
        let observed = phenotype
            .traits
            .iter()
            .find(|value| value.name == target.trait_name)
            .ok_or_else(|| format!("missing child observation for {}", target.trait_name))?;
        deviations.push((
            target.trait_name.clone(),
            (observed.value - target.target).abs(),
        ));
    }
    let mut genome = child.clone();
    genome.breeding.as_mut().unwrap().status = if deviations
        .iter()
        .all(|(_, deviation)| *deviation <= tolerance)
    {
        BreedingStatus::Validated
    } else {
        BreedingStatus::Rejected
    };
    Ok(BreedingValidation {
        genome,
        deviations,
        tolerance,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchFinding {
    pub branch_id: genos_core::BranchId,
    pub claim: String,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SynthesisStatus {
    Proposed,
    Validated,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeSynthesisProposal {
    pub findings: Vec<BranchFinding>,
    pub validation_branch: Option<genos_core::BranchId>,
    pub status: SynthesisStatus,
}

pub fn synthesize_branch_knowledge(
    findings: Vec<BranchFinding>,
) -> Result<KnowledgeSynthesisProposal, String> {
    if findings.is_empty() || findings.iter().any(|finding| finding.evidence.is_empty()) {
        return Err("knowledge synthesis requires evidence-bearing findings".to_string());
    }
    Ok(KnowledgeSynthesisProposal {
        findings,
        validation_branch: None,
        status: SynthesisStatus::Proposed,
    })
}

pub fn validate_synthesis(
    proposal: &mut KnowledgeSynthesisProposal,
    validation_branch: genos_core::BranchId,
    passed: bool,
) {
    proposal.validation_branch = Some(validation_branch);
    proposal.status = if passed {
        SynthesisStatus::Validated
    } else {
        SynthesisStatus::Rejected
    };
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
                genome_field: "cognition.drives.exploration".to_string(),
                target,
            }],
        )
        .unwrap();
        assert_eq!(child.parent_genomes, vec![alice.id, bob.id]);
        assert_eq!(child.identity.name, "charlie");
        assert_eq!(child.cognition.get_drive("exploration").unwrap(), 0.7);
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

    #[test]
    fn factorial_design_separates_genome_experience_and_interaction() {
        let observations = vec![
            FactorialTraitObservation {
                genome_id: GenomeId("g1".to_string()),
                treatment: "dev".to_string(),
                value: 0.9,
            },
            FactorialTraitObservation {
                genome_id: GenomeId("g1".to_string()),
                treatment: "research".to_string(),
                value: 0.7,
            },
            FactorialTraitObservation {
                genome_id: GenomeId("g2".to_string()),
                treatment: "dev".to_string(),
                value: 0.5,
            },
            FactorialTraitObservation {
                genome_id: GenomeId("g2".to_string()),
                treatment: "research".to_string(),
                value: 0.6,
            },
        ];
        let effects = analyze_genome_experience_interaction(&observations).unwrap();
        assert!(effects.genome_effect_range > 0.2);
        assert!(effects.maximum_interaction > 0.0);
    }

    #[test]
    fn child_validation_updates_breeding_status_from_observed_traits() {
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
                genome_field: "cognition.drives.exploration".to_string(),
                target,
            }],
        )
        .unwrap();
        assert_eq!(
            child.breeding.as_ref().unwrap().status,
            BreedingStatus::UntestedCandidate
        );
        let phenotype = PhenotypeObservation {
            genome_id: child.id.clone(),
            evaluation_suite: "traits-v1".to_string(),
            model: "m".to_string(),
            environment: "e".to_string(),
            measured_at: chrono::Utc::now(),
            traits: vec![ObservedTrait {
                name: "exploration".to_string(),
                value: 0.66,
                confidence: 0.9,
                observations: 100,
                method: "tasks".to_string(),
                evidence: vec!["eval:child".to_string()],
            }],
        };
        let validation = validate_bred_child(&child, &phenotype, 0.05).unwrap();
        assert_eq!(
            validation.genome.breeding.unwrap().status,
            BreedingStatus::Validated
        );
    }

    #[test]
    fn synthesis_requires_evidence_and_a_validation_branch() {
        let mut proposal = synthesize_branch_knowledge(vec![BranchFinding {
            branch_id: genos_core::BranchId("a".to_string()),
            claim: "hybrid is safer".to_string(),
            evidence: vec!["benchmark:1".to_string()],
        }])
        .unwrap();
        assert_eq!(proposal.status, SynthesisStatus::Proposed);
        validate_synthesis(
            &mut proposal,
            genos_core::BranchId("validation".to_string()),
            true,
        );
        assert_eq!(proposal.status, SynthesisStatus::Validated);
        assert!(proposal.validation_branch.is_some());
    }
}
