pub use genos_cell as cell;
pub use genos_genome as genome;

pub mod bioluminescence;
pub mod chemistry;
pub mod ecology;
pub mod embryology;
pub mod glial;
pub mod glycolysis;
pub mod lipid_membrane;
pub use glial::glial_cell::GlialCell;
pub use glial::{GlialEnvironment, GlialPipeline};
pub mod instinct;
pub use instinct::{
    ExecutionContext, FixedActionPattern, HormoneState, INSTINCT_LOCUS_PREFIX,
    InnateReleasingMechanism, InstinctLibrary, InstinctOutcome, InstinctProgram,
    InstinctRunContext, Modality, MotorStep, SignStimulus, SignalProvenance, StimulusField,
    TriggerEvaluation, is_instinct_locus,
};
pub mod neurobiology;
pub mod pathology;
pub mod phenotype;
pub mod quorum;
pub use quorum::{AutoinducerType, QuorumPhenotype, QuorumSensingSystem};
pub mod redundancy;
pub mod sensory;
pub mod signaling;
pub mod specialized_cells;
pub use specialized_cells::choanocyte::{
    Choanocyte, ChoanodermChamber, RawSignalPacket, SiftingResult,
};
pub use specialized_cells::cnidocyte::{Cnidocyte, NematocystCapsule, ToxinPayload};
pub use specialized_cells::electrocyte::{ElectricOrganStack, ElectricShockBurst, Electrocyte};
pub use specialized_cells::guard_cell::{GuardCell, StomatalPore, ThrottleResult};
pub use specialized_cells::iridophore::{GuaninePlateletLattice, Iridophore, ObserverPerspective};
pub use specialized_cells::prokaryote::{
    HgtTransferReport, Plasmid, PlasmidExecutionYield, ProkaryoticAgent,
};
pub use specialized_cells::tracheid::{
    LigninPorousPlate, OssificationReport, SapTransportYield, Tracheid, TracheidState,
};
pub mod spore;
pub mod therapy;
pub mod therapy_extended;
pub mod tissue;

#[cfg(test)]
mod tests {
    use super::*;
    use genos_cell::AgentCell;
    use pathology::{DiseaseCategory, Pathology};
    use therapy::{SystemicTherapy, apply_systemic_therapy_to_cell};

    #[test]
    fn test_modules_presence() {
        assert!(matches!(
            therapy::Therapy::TargetedTherapy,
            therapy::Therapy::TargetedTherapy
        ));
    }

    #[test]
    fn test_clinical_state_and_iatrogenesis() {
        let mut cell = AgentCell::new("Chidi", "Esprit logique", "Auditor");
        assert!(cell.clinical.is_healthy());

        // Diagnostic d'un orage cytokinique (Auto-immun)
        cell.clinical
            .diagnose(Pathology::CytokineStorm { il6_level: 15.0 });
        assert!(!cell.clinical.is_healthy());
        assert!(
            cell.clinical
                .has_disease_category(DiseaseCategory::Autoimmune)
        );

        // Traitement par surdose de corticoïdes (> 0.8) -> Guérit l'orage mais induit un Coma Iatrogène
        let outcome =
            apply_systemic_therapy_to_cell(&SystemicTherapy::Corticosteroids(1.0), &mut cell);
        assert!(
            outcome
                .cured_pathologies
                .contains(&"Orage Cytokinique".to_string())
        );
        assert!(
            cell.clinical
                .has_disease_category(DiseaseCategory::Iatrogenic)
        );

        // Détoxification Iatrogène
        let detox_outcome =
            apply_systemic_therapy_to_cell(&SystemicTherapy::DetoxificationWashout, &mut cell);
        assert!(
            detox_outcome
                .cured_pathologies
                .contains(&"Coma Stéroïdien Iatrogène".to_string())
        );
        assert!(cell.clinical.is_healthy());
    }

    #[test]
    fn test_nosocomial_quarantine_and_antiseptic() {
        let mut cell = AgentCell::new("Kwame", "Planificateur", "Worker");
        cell.clinical.diagnose(Pathology::CrossContamination {
            source_capsule: "capsule_red_zone".to_string(),
            pathogen_signature: "PROMPT_INJECTION_SIG".to_string(),
        });
        assert!(
            cell.clinical
                .has_disease_category(DiseaseCategory::Nosocomial)
        );

        // Quarantaine
        apply_systemic_therapy_to_cell(
            &SystemicTherapy::QuarantineIsolation {
                capsule_id: "capsule_red_zone".into(),
            },
            &mut cell,
        );
        assert!(cell.clinical.is_quarantined);

        // Purge antiseptique
        apply_systemic_therapy_to_cell(
            &SystemicTherapy::AntisepticPurge {
                target_signature: "PROMPT_INJECTION_SIG".into(),
            },
            &mut cell,
        );
        assert!(cell.clinical.is_healthy());
    }

    #[test]
    fn metabolic_proposed_therapies_only_change_present_bounded_markers() {
        let mut cell = AgentCell::new("Clinique", "Simulation", "Worker");
        cell.clinical
            .markers
            .insert("insulin_resistance".into(), 0.5);
        let outcome =
            apply_systemic_therapy_to_cell(&SystemicTherapy::InsulinSensitizerMetformin, &mut cell);
        assert_eq!(cell.clinical.markers["insulin_resistance"], 0.25);
        assert_eq!(outcome.applied_markers, vec!["insulin_resistance réduit"]);
        let absent =
            apply_systemic_therapy_to_cell(&SystemicTherapy::LysosomalUraturicPurge, &mut cell);
        assert!(absent.cured_pathologies.is_empty());
        assert!(absent.message.contains("Aucune cible"));
        cell.clinical
            .markers
            .insert("purine_production".into(), 2.0);
        let invalid = apply_systemic_therapy_to_cell(
            &SystemicTherapy::AllopurinolXanthineInhibitor,
            &mut cell,
        );
        assert!(invalid.cured_pathologies.is_empty());
        assert_eq!(cell.clinical.markers["purine_production"], 2.0);
    }
    #[test]
    fn vascular_proposed_therapy_requires_safe_bbb_and_target() {
        let mut cell = AgentCell::new("Vasculaire", "Simulation", "Worker");
        cell.clinical
            .markers
            .insert("vascular_occlusion".into(), 0.75);
        let blocked = apply_systemic_therapy_to_cell(
            &SystemicTherapy::CoronaryReperfusionThrombolysis,
            &mut cell,
        );
        assert!(blocked.message.contains("refusé"));
        assert!(blocked.cured_pathologies.is_empty());
        assert_eq!(cell.clinical.markers["vascular_occlusion"], 0.75);
        cell.clinical
            .markers
            .insert("blood_brain_barrier_integrity".into(), 0.6);
        let applied = apply_systemic_therapy_to_cell(
            &SystemicTherapy::CoronaryReperfusionThrombolysis,
            &mut cell,
        );
        assert_eq!(applied.applied_markers, vec!["vascular_occlusion réduit"]);
        assert_eq!(cell.clinical.markers["vascular_occlusion"], 0.5);
    }
    #[test]
    fn degenerative_proposed_therapies_target_only_their_markers() {
        let cases = [
            (
                SystemicTherapy::LevodopaSupplementation,
                "dopamine_signal_deficit",
            ),
            (
                SystemicTherapy::DeepBrainStimulation,
                "neural_activity_instability",
            ),
            (SystemicTherapy::Viscosupplementation, "joint_friction"),
            (SystemicTherapy::SenolyticPurge, "senescent_load"),
        ];
        for (therapy, marker) in cases {
            let mut cell = AgentCell::new("Neuro", "Simulation", "Worker");
            cell.clinical.markers.insert(marker.into(), 0.5);
            let outcome = apply_systemic_therapy_to_cell(&therapy, &mut cell);
            assert_eq!(outcome.applied_markers, vec![format!("{} réduit", marker)]);
            assert_eq!(cell.clinical.markers[marker], 0.25);
        }
    }
    #[test]
    fn chelation_only_reduces_a_valid_present_toxin_marker() {
        let mut cell = AgentCell::new("Exposition", "Simulation", "Worker");
        cell.clinical
            .markers
            .insert("metal_toxin_load".into(), 0.75);
        let applied = apply_systemic_therapy_to_cell(&SystemicTherapy::ChelationTherapy, &mut cell);
        assert_eq!(applied.applied_markers, vec!["metal_toxin_load réduit"]);
        assert!(applied.cured_pathologies.is_empty());
        assert_eq!(cell.clinical.markers["metal_toxin_load"], 0.5);

        let mut absent_cell = AgentCell::new("Sans exposition", "Simulation", "Worker");
        let absent =
            apply_systemic_therapy_to_cell(&SystemicTherapy::ChelationTherapy, &mut absent_cell);
        assert!(absent.applied_markers.is_empty());
        assert!(absent.message.contains("Aucune cible"));
        absent_cell
            .clinical
            .markers
            .insert("metal_toxin_load".into(), f64::NAN);
        let invalid =
            apply_systemic_therapy_to_cell(&SystemicTherapy::ChelationTherapy, &mut absent_cell);
        assert!(invalid.applied_markers.is_empty());
        assert!(absent_cell.clinical.markers["metal_toxin_load"].is_nan());
    }
    #[test]
    fn emerging_proposed_therapies_require_and_only_modify_their_target_markers() {
        let cases = [
            (
                SystemicTherapy::AntiretroviralCombination,
                "viral_replication_load",
            ),
            (SystemicTherapy::AntimalarialACT, "parasite_load"),
            (
                SystemicTherapy::ExonSkippingAntisense,
                "exon_expression_deficit",
            ),
            (SystemicTherapy::CFTRModulatorTriad, "cftr_function_deficit"),
            (SystemicTherapy::CartCellInfusion, "tumor_load"),
            (
                SystemicTherapy::KetamineRapidInfusion,
                "synaptic_response_deficit",
            ),
            (
                SystemicTherapy::MoodStabilizerLithium,
                "affective_instability",
            ),
            (
                SystemicTherapy::AntipsychoticAtypical,
                "cognitive_signal_disorder",
            ),
            (
                SystemicTherapy::FetalCarrierReactivation,
                "fetal_carrier_silencing",
            ),
        ];
        for (therapy, marker) in cases {
            let mut cell = AgentCell::new("Clinical", "Simulation", "Worker");
            cell.clinical.markers.insert(marker.into(), 0.75);
            let applied = apply_systemic_therapy_to_cell(&therapy, &mut cell);
            assert_eq!(applied.applied_markers, vec![format!("{} réduit", marker)]);
            assert!(applied.cured_pathologies.is_empty());
            assert_eq!(cell.clinical.markers[marker], 0.5);
            let mut absent_cell = AgentCell::new("Sans cible", "Simulation", "Worker");
            let absent = apply_systemic_therapy_to_cell(&therapy, &mut absent_cell);
            assert!(absent.applied_markers.is_empty());
            assert!(absent.message.contains("Aucune cible"));
        }
    }
    #[test]
    fn nosology_therapy_variants_round_trip_and_old_outcomes_deserialize() {
        let therapies = [
            SystemicTherapy::CartCellInfusion,
            SystemicTherapy::LevodopaSupplementation,
            SystemicTherapy::KetamineRapidInfusion,
            SystemicTherapy::MoodStabilizerLithium,
            SystemicTherapy::AntipsychoticAtypical,
            SystemicTherapy::InsulinSensitizerMetformin,
            SystemicTherapy::LevothyroxineHormoneReplacement,
            SystemicTherapy::ColchicineInhibition,
            SystemicTherapy::CoronaryReperfusionThrombolysis,
            SystemicTherapy::VasodilatorFlowControl,
            SystemicTherapy::AntiretroviralCombination,
            SystemicTherapy::AntimalarialACT,
            SystemicTherapy::ExonSkippingAntisense,
            SystemicTherapy::CFTRModulatorTriad,
            SystemicTherapy::ChelationTherapy,
            SystemicTherapy::AllopurinolXanthineInhibitor,
            SystemicTherapy::LysosomalUraturicPurge,
            SystemicTherapy::DeepBrainStimulation,
            SystemicTherapy::Viscosupplementation,
            SystemicTherapy::SenolyticPurge,
            SystemicTherapy::FetalCarrierReactivation,
            SystemicTherapy::AntiAdhesionVasodilator,
            SystemicTherapy::AntiNmdReadthrough,
            SystemicTherapy::NeuroprotectiveAstrocyticFlush,
            SystemicTherapy::BloodBrainBarrierSealant,
        ];
        for therapy in therapies {
            let encoded = serde_json::to_string(&therapy).unwrap();
            let decoded: SystemicTherapy = serde_json::from_str(&encoded).unwrap();
            assert_eq!(therapy, decoded);
        }
        let legacy = r#"{"therapy_name":"legacy","cured_pathologies":[],"induced_side_effects":[],"message":"ok"}"#;
        let outcome: therapy::TherapyOutcome = serde_json::from_str(legacy).unwrap();
        assert!(outcome.applied_markers.is_empty());
    }
    #[test]
    fn test_degenerative_stem_cell_cure() {
        let mut cell = AgentCell::new("Griot", "Mémoire", "Historian");
        cell.bud_scars = 50;
        cell.is_senescent = true;
        cell.clinical
            .diagnose(Pathology::TelomereExhaustion { bud_scars: 50 });
        cell.clinical.diagnose(Pathology::ReplicativeSenescence);

        assert!(
            cell.clinical
                .has_disease_category(DiseaseCategory::Degenerative)
        );

        // Cure par cellules souches
        apply_systemic_therapy_to_cell(&SystemicTherapy::StemCellReplacement, &mut cell);
        assert!(!cell.is_senescent);
        assert_eq!(cell.bud_scars, 0);
        assert!(cell.clinical.is_healthy());
    }
}
