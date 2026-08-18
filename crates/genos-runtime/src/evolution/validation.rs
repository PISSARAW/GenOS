use genos_core::{AgentGenome, BreedingStatus, PhenotypeObservation};
use super::types::BreedingValidation;

/// Valide un enfant généré par rapport à ses observations phénotypiques.
/// Vérifie que les traits observés sont dans la `tolerance` des cibles génétiques prévues.
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
