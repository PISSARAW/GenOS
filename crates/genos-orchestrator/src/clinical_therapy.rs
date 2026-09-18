use genos_biology::pathology::Pathology;
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
    }
}
