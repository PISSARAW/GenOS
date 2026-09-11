pub use genos_cell as cell;
pub use genos_genome as genome;

pub mod bioluminescence;
pub mod ecology;
pub mod embryology;
pub mod glial;
pub use glial::{GlialEnvironment, GlialPipeline};
pub use glial::glial_cell::GlialCell;
pub mod neurobiology;
pub mod pathology;
pub mod phenotype;
pub mod quorum;
pub use quorum::{AutoinducerType, QuorumPhenotype, QuorumSensingSystem};
pub mod redundancy;
pub mod signaling;
pub mod spore;
pub mod therapy;
pub mod tissue;

#[cfg(test)]
mod tests {
    use super::*;
    use genos_cell::AgentCell;
    use pathology::{DiseaseCategory, Pathology};
    use therapy::{apply_systemic_therapy_to_cell, SystemicTherapy};

    #[test]
    fn test_modules_presence() {
        assert!(matches!(therapy::Therapy::TargetedTherapy, therapy::Therapy::TargetedTherapy));
    }

    #[test]
    fn test_clinical_state_and_iatrogenesis() {
        let mut cell = AgentCell::new("Chidi", "Esprit logique", "Auditor");
        assert!(cell.clinical.is_healthy());

        // Diagnostic d'un orage cytokinique (Auto-immun)
        cell.clinical.diagnose(Pathology::CytokineStorm { il6_level: 15.0 });
        assert!(!cell.clinical.is_healthy());
        assert!(cell.clinical.has_disease_category(DiseaseCategory::Autoimmune));

        // Traitement par surdose de corticoïdes (> 0.8) -> Guérit l'orage mais induit un Coma Iatrogène
        let outcome = apply_systemic_therapy_to_cell(&SystemicTherapy::Corticosteroids(1.0), &mut cell);
        assert!(outcome.cured_pathologies.contains(&"Orage Cytokinique".to_string()));
        assert!(cell.clinical.has_disease_category(DiseaseCategory::Iatrogenic));

        // Détoxification Iatrogène
        let detox_outcome = apply_systemic_therapy_to_cell(&SystemicTherapy::DetoxificationWashout, &mut cell);
        assert!(detox_outcome.cured_pathologies.contains(&"Coma Stéroïdien Iatrogène".to_string()));
        assert!(cell.clinical.is_healthy());
    }

    #[test]
    fn test_nosocomial_quarantine_and_antiseptic() {
        let mut cell = AgentCell::new("Kwame", "Planificateur", "Worker");
        cell.clinical.diagnose(Pathology::CrossContamination {
            source_capsule: "capsule_red_zone".to_string(),
            pathogen_signature: "PROMPT_INJECTION_SIG".to_string(),
        });
        assert!(cell.clinical.has_disease_category(DiseaseCategory::Nosocomial));

        // Quarantaine
        apply_systemic_therapy_to_cell(&SystemicTherapy::QuarantineIsolation { capsule_id: "capsule_red_zone".into() }, &mut cell);
        assert!(cell.clinical.is_quarantined);

        // Purge antiseptique
        apply_systemic_therapy_to_cell(&SystemicTherapy::AntisepticPurge { target_signature: "PROMPT_INJECTION_SIG".into() }, &mut cell);
        assert!(cell.clinical.is_healthy());
    }

    #[test]
    fn test_degenerative_stem_cell_cure() {
        let mut cell = AgentCell::new("Griot", "Mémoire", "Historian");
        cell.bud_scars = 50;
        cell.is_senescent = true;
        cell.clinical.diagnose(Pathology::TelomereExhaustion { bud_scars: 50 });
        cell.clinical.diagnose(Pathology::ReplicativeSenescence);

        assert!(cell.clinical.has_disease_category(DiseaseCategory::Degenerative));

        // Cure par cellules souches
        apply_systemic_therapy_to_cell(&SystemicTherapy::StemCellReplacement, &mut cell);
        assert!(!cell.is_senescent);
        assert_eq!(cell.bud_scars, 0);
        assert!(cell.clinical.is_healthy());
    }
}
