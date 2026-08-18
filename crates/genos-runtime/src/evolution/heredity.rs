use genos_core::{compare_genome_and_state, compare_snapshots};

use super::types::{
    CohortControls, ExperienceEffect, FactorialTraitObservation, GenomeExperienceEffects,
    HeredityCohortMember, HeredityCohortReport,
};

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
    validate_cohort_baselines(&controls, members)?;

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
        .filter_map(|trait_name| compute_trait_effect(trait_name, members))
        .collect();

    Ok(HeredityCohortReport {
        genome_id: members[0].baseline.genome.id.clone(),
        controls,
        effects,
    })
}

fn validate_cohort_baselines(
    controls: &CohortControls,
    members: &[HeredityCohortMember],
) -> Result<(), String> {
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
    Ok(())
}

fn compute_trait_effect(
    trait_name: String,
    members: &[HeredityCohortMember],
) -> Option<ExperienceEffect> {
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
}
