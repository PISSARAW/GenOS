use genos_biology::pathology::{check_degenerative_state, Pathology};
use genos_cell::AgentCell;
use genos_biology::therapy::SystemicTherapy;

pub fn therapy_for_pathology(pathology: &Pathology) -> SystemicTherapy {
    match pathology {
        Pathology::CytokineStorm { .. } => SystemicTherapy::Tocilizumab,
        Pathology::MacrophageHyperactivation | Pathology::AutologousTargeting { .. } => {
            SystemicTherapy::ImmunosuppressiveWash
        }
        Pathology::CrossContamination { .. } | Pathology::HospitalAcquiredInfection { .. } => {
            SystemicTherapy::AntisepticPurge {
                target_signature: pathology.name().to_string(),
            }
        }
        Pathology::SteroidInducedComa { .. }
        | Pathology::AntibioticCollateralDamage { .. }
        | Pathology::PersistentReceptorBlockade
        | Pathology::IatrogenicCognitiveDrift { .. } => SystemicTherapy::DetoxificationWashout,
        Pathology::TelomereExhaustion { .. }
        | Pathology::ReplicativeSenescence
        | Pathology::PrionAggregation { .. }
        | Pathology::ContextualDecay { .. } => SystemicTherapy::StemCellReplacement,
        Pathology::ViralInfection { .. } => SystemicTherapy::Antiviral,
        _ => SystemicTherapy::HomeostaticDoseCorrection,
    }
}

pub fn first_pathology_for_cell(cell: &AgentCell) -> Option<Pathology> {
    cell.clinical
        .active_pathologies
        .first()
        .cloned()
        .or_else(|| check_degenerative_state(cell))
}

pub fn diagnose_active_virions(ecosystem: &mut crate::GenosEcosystem) {
    let signatures: Vec<String> = ecosystem
        .virology
        .virions
        .iter()
        .filter(|virion| !virion.is_neutralized)
        .map(|virion| virion.envelope_spike.clone())
        .collect();
    if signatures.is_empty() {
        return;
    }
    for cell in ecosystem.orchestrator.active_cells.values_mut() {
        if !cell.clinical.is_quarantined && signatures.iter().any(|signature| signature == &cell.role) {
            for signature in &signatures {
                cell.clinical.diagnose(Pathology::ViralInfection {
                    pathogen_signature: signature.clone(),
                });
            }
        }
    }
}
