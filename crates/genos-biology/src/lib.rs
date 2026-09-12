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
pub mod sensory;
pub mod signaling;
pub mod specialized_cells;
pub use specialized_cells::cnidocyte::{Cnidocyte, NematocystCapsule, ToxinPayload};
pub use specialized_cells::electrocyte::{ElectricOrganStack, ElectricShockBurst, Electrocyte};
pub use specialized_cells::choanocyte::{Choanocyte, ChoanodermChamber, RawSignalPacket, SiftingResult};
pub use specialized_cells::iridophore::{GuaninePlateletLattice, Iridophore, ObserverPerspective};
pub use specialized_cells::guard_cell::{GuardCell, StomatalPore, ThrottleResult};
pub use specialized_cells::tracheid::{LigninPorousPlate, OssificationReport, SapTransportYield, Tracheid, TracheidState};
pub use specialized_cells::prokaryote::{HgtTransferReport, Plasmid, PlasmidExecutionYield, ProkaryoticAgent};
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

    #[test]
    fn test_theanine_gaba_modulation_and_calm_alertness() {
        use neurobiology::{NervousSystem, NeuroSignal, Neurotransmitter, PsychoactiveSubstance, CognitiveFocusState};

        let mut ns_baseline = NervousSystem::new("node-baseline");
        let mut ns_theanine = NervousSystem::new("node-theanine");

        // Administre 200mg de L-Théanine
        ns_theanine.administer_substance(PsychoactiveSubstance::Theanine, 200.0);
        assert_eq!(ns_theanine.cognitive_state(), CognitiveFocusState::CalmAlertness);

        // Signal GABA identique sur les deux
        let gaba_signal = NeuroSignal { transmitter: Neurotransmitter::GABA, amount: 2.0 };
        ns_baseline.receive_neurotransmitter("pre-syn", &gaba_signal);
        ns_theanine.receive_neurotransmitter("pre-syn", &gaba_signal);

        // L-Théanine doit augmenter l'inhibition GABA (potentiel plus négatif / hyperpolarisé)
        assert!(ns_theanine.soma.current_potential < ns_baseline.soma.current_potential);
    }

    #[test]
    fn test_caffeine_glutamate_boost_and_jitter() {
        use neurobiology::{NervousSystem, NeuroSignal, Neurotransmitter, PsychoactiveSubstance, CognitiveFocusState};

        let mut ns_baseline = NervousSystem::new("node-baseline");
        let mut ns_caffeine = NervousSystem::new("node-caffeine");

        // Forte dose de caféine pure (150mg) sans théanine -> HyperarousalJitter
        ns_caffeine.administer_substance(PsychoactiveSubstance::Caffeine, 150.0);
        assert_eq!(ns_caffeine.cognitive_state(), CognitiveFocusState::HyperarousalJitter);

        let glu_signal = NeuroSignal { transmitter: Neurotransmitter::Glutamate, amount: 2.0 };
        ns_baseline.receive_neurotransmitter("pre-syn", &glu_signal);
        ns_caffeine.receive_neurotransmitter("pre-syn", &glu_signal);

        // Caféine doit fortement booster l'excitation glutamatergique
        assert!(ns_caffeine.soma.current_potential > ns_baseline.soma.current_potential);
    }

    #[test]
    fn test_smart_caffeine_theanine_synergy_flow_state() {
        use neurobiology::{NervousSystem, PsychoactiveSubstance, CognitiveFocusState};

        let mut ns = NervousSystem::new("node-flow");
        // Stack synergique classique : 100mg Caféine + 200mg L-Théanine
        ns.administer_substance(PsychoactiveSubstance::Caffeine, 100.0);
        ns.administer_substance(PsychoactiveSubstance::Theanine, 200.0);

        // Doit basculer en FlowState
        assert_eq!(ns.cognitive_state(), CognitiveFocusState::FlowState);
    }

    #[test]
    fn test_theine_sustained_release_and_pharmacokinetics() {
        use neurobiology::{NervousSystem, PsychoactiveSubstance, CognitiveFocusState};

        let mut ns = NervousSystem::new("node-tea");
        ns.administer_substance(PsychoactiveSubstance::Theine, 80.0);
        assert_eq!(ns.cognitive_state(), CognitiveFocusState::CalmAlertness);

        let initial_dose = ns.active_substances[0].current_dose_mg;
        // Métabolisation de 5 ticks
        for _ in 0..5 {
            ns.metabolize_substances();
        }
        let current_dose = ns.active_substances[0].current_dose_mg;
        assert!(current_dose < initial_dose);
        assert!(current_dose > 0.0);
    }

    #[test]
    fn test_systemic_nootropic_therapy() {
        use neurobiology::PsychoactiveSubstance;

        let mut cell = AgentCell::new("Senghor", "Poète & penseur", "Philosophe");
        let outcome = apply_systemic_therapy_to_cell(
            &SystemicTherapy::NootropicInfusion {
                substance: PsychoactiveSubstance::Theanine,
                dose_mg: 150.0,
            },
            &mut cell,
        );
        assert!(outcome.cured_pathologies.iter().any(|c| c.contains("L-Théanine")));
        assert!(cell.clinical.clinical_log.iter().any(|log| log.contains("Infusion nootropique: L-Théanine")));
    }
}
