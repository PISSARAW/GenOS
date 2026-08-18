use super::*;
use genos_core::{
    AgentSnapshot, BreedingStatus, GenomeId, ObservedTrait, PhenotypeObservation,
};
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
        &genos_core::RecombinationStrategy::HomologousRecombination,
        None,
        &[],
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
        &genos_core::RecombinationStrategy::HomologousRecombination,
        None,
        &[],
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
