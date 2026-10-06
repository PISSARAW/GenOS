use genos_biology::pathology::{Pathology, check_degenerative_state};
use genos_biology::therapy::SystemicTherapy;
use genos_cell::AgentCell;

pub fn therapy_for_pathology(pathology: &Pathology) -> SystemicTherapy {
    match pathology {
        Pathology::CytokineStorm { .. } => SystemicTherapy::Tocilizumab,
        Pathology::MacrophageHyperactivation | Pathology::AutologousTargeting { .. } => {
            SystemicTherapy::ImmunosuppressiveWash
        }
        Pathology::CrossContamination {
            pathogen_signature, ..
        } => SystemicTherapy::AntisepticPurge {
            target_signature: pathogen_signature.clone(),
        },
        Pathology::HospitalAcquiredInfection { origin_facility } => {
            SystemicTherapy::AntisepticPurge {
                target_signature: origin_facility.clone(),
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
        Pathology::Nosological { condition, .. } => {
            let spec = genos_biology::nosology_catalog::condition_spec(*condition);
            serde_json::from_value(serde_json::json!(spec.therapies[0]))
                .expect("thérapie du catalogue")
        }
        Pathology::TherapyAdverseEffect { .. } => SystemicTherapy::DetoxificationWashout,
    }
}

pub fn first_pathology_for_cell(cell: &AgentCell) -> Option<Pathology> {
    cell.clinical
        .active_pathologies
        .first()
        .cloned()
        .or_else(|| {
            genos_biology::nosology::diagnose_markers(&cell.clinical)
                .into_iter()
                .next()
        })
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
        if !cell.clinical.is_quarantined
            && signatures.iter().any(|signature| signature == &cell.role)
        {
            for signature in signatures
                .iter()
                .filter(|signature| *signature == &cell.role)
            {
                cell.clinical.diagnose(Pathology::ViralInfection {
                    pathogen_signature: signature.clone(),
                });
            }
        }
    }
}

pub fn diagnose_active_cells(ecosystem: &mut crate::GenosEcosystem) {
    for cell in ecosystem.orchestrator.active_cells.values_mut() {
        genos_biology::nosology::synchronize_diagnoses(cell);
    }
}
