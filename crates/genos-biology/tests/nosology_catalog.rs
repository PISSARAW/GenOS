use genos_biology::nosology::{diagnose_markers, proposed_therapies, synchronize_diagnoses};
use genos_biology::nosology_catalog::catalog;
use genos_biology::pathology::{Pathology, assess_agent_clinical_status};
use genos_biology::therapy::{SystemicTherapy, TherapyStatus, apply_systemic_therapy_to_cell};
use genos_cell::AgentCell;
use std::collections::HashSet;

fn therapy(name: &str) -> SystemicTherapy {
    serde_json::from_value(serde_json::json!(name)).unwrap()
}
fn cell() -> AgentCell {
    AgentCell::new("Nosologie", "Simulation", "Worker")
}

#[test]
fn catalog_covers_every_documented_condition_and_family() {
    let catalog = catalog();
    assert_eq!(catalog.schema, "genos.nosology/v1");
    assert_eq!(catalog.conditions.len(), 28);
    assert_eq!(
        catalog
            .conditions
            .iter()
            .map(|s| s.category.clone())
            .collect::<HashSet<_>>()
            .len(),
        9
    );
    assert_eq!(catalog.therapies.len(), 48);
    let unique: HashSet<_> = catalog.therapies.iter().map(|s| s.id.clone()).collect();
    assert_eq!(unique.len(), catalog.therapies.len());
    for condition in &catalog.conditions {
        assert_eq!(condition.category, condition.id.category());
        assert!(!condition.markers.is_empty());
        assert!(condition.therapies.iter().all(|name| unique.contains(name)));
    }
}

#[test]
fn every_catalog_therapy_has_a_serializable_runtime_variant() {
    for spec in &catalog().therapies {
        let typed = therapy(&spec.id);
        assert_eq!(
            serde_json::to_value(typed).unwrap(),
            serde_json::json!(spec.id)
        );
        assert!(spec.amount > 0.0 && spec.amount <= 1.0);
    }
}

#[test]
fn every_operator_changes_only_its_present_targets() {
    for spec in &catalog().therapies {
        let mut patient = cell();
        patient
            .clinical
            .markers
            .insert(spec.targets[0].clone(), 0.75);
        patient.clinical.markers.insert("unrelated".into(), 0.9);
        for guard in &spec.guards {
            patient.clinical.markers.insert(guard.marker.clone(), 1.0);
        }
        let outcome = apply_systemic_therapy_to_cell(&therapy(&spec.id), &mut patient);
        assert_eq!(outcome.status, TherapyStatus::Applied, "{}", spec.id);
        assert_eq!(patient.clinical.markers[&spec.targets[0]], 0.5);
        assert_eq!(patient.clinical.markers["unrelated"], 0.9);
        assert_eq!(outcome.marker_changes.len(), 1);
        assert!(outcome.cured_pathologies.is_empty());
    }
}

#[test]
fn missing_invalid_and_exhausted_targets_never_claim_application() {
    for spec in &catalog().therapies {
        for value in [
            None,
            Some(f64::NAN),
            Some(f64::INFINITY),
            Some(-0.1),
            Some(1.1),
            Some(0.0),
        ] {
            let mut patient = cell();
            if let Some(value) = value {
                patient
                    .clinical
                    .markers
                    .insert(spec.targets[0].clone(), value);
            }
            for guard in &spec.guards {
                patient.clinical.markers.insert(guard.marker.clone(), 1.0);
            }
            let outcome = apply_systemic_therapy_to_cell(&therapy(&spec.id), &mut patient);
            assert_eq!(
                outcome.status,
                TherapyStatus::NoTarget,
                "{} {:?}",
                spec.id,
                value
            );
            assert!(outcome.applied_markers.is_empty());
            assert!(outcome.cured_pathologies.is_empty());
            assert!(patient.clinical.last_treatment_applied.is_none());
            assert!(
                !patient
                    .clinical
                    .clinical_log
                    .iter()
                    .any(|line| line.starts_with("Traitement administré"))
            );
        }
    }
}

#[test]
fn repeated_application_stops_at_zero() {
    let mut patient = cell();
    patient
        .clinical
        .markers
        .insert("metal_toxin_load".into(), 0.1);
    assert_eq!(
        apply_systemic_therapy_to_cell(&SystemicTherapy::ChelationTherapy, &mut patient).status,
        TherapyStatus::Applied
    );
    assert_eq!(patient.clinical.markers["metal_toxin_load"], 0.0);
    assert_eq!(
        apply_systemic_therapy_to_cell(&SystemicTherapy::ChelationTherapy, &mut patient).status,
        TherapyStatus::NoTarget
    );
}

#[test]
fn no_operator_resurrects_an_apoptotic_cell() {
    for spec in &catalog().therapies {
        let mut patient = cell();
        patient.conscience.is_apoptotic = true;
        patient
            .clinical
            .markers
            .insert(spec.targets[0].clone(), 0.75);
        assert_eq!(
            apply_systemic_therapy_to_cell(&therapy(&spec.id), &mut patient).status,
            TherapyStatus::Refused
        );
        assert_eq!(patient.clinical.markers[&spec.targets[0]], 0.75);
    }
}

#[test]
fn every_condition_is_detected_and_resolved_with_complete_evidence() {
    for spec in &catalog().conditions {
        let mut patient = cell();
        for marker in &spec.markers {
            patient.clinical.markers.insert(marker.clone(), 0.75);
        }
        synchronize_diagnoses(&mut patient);
        assert!(patient.clinical.active_pathologies.iter().any(
            |p| matches!(p, Pathology::Nosological { condition, .. } if *condition == spec.id)
        ));
        assert!(!proposed_therapies(&patient).is_empty());
        patient
            .clinical
            .markers
            .insert("blood_brain_barrier_integrity".into(), 1.0);
        for name in &spec.therapies {
            apply_systemic_therapy_to_cell(&therapy(name), &mut patient);
        }
        assert!(
            !patient.clinical.active_pathologies.iter().any(
                |p| matches!(p, Pathology::Nosological { condition, .. } if *condition == spec.id)
            ),
            "{:?}",
            spec.id
        );
    }
}

#[test]
fn missing_measurement_cannot_erase_a_previous_diagnosis() {
    let spec = catalog()
        .conditions
        .iter()
        .find(|s| s.markers.len() > 1)
        .unwrap();
    let mut patient = cell();
    for marker in &spec.markers {
        patient.clinical.markers.insert(marker.clone(), 0.75);
    }
    synchronize_diagnoses(&mut patient);
    patient.clinical.markers.remove(&spec.markers[1]);
    let outcome = apply_systemic_therapy_to_cell(&therapy(&spec.therapies[0]), &mut patient);
    assert!(
        !outcome
            .cured_pathologies
            .contains(&spec.id.name().to_string())
    );
    assert!(
        patient
            .clinical
            .active_pathologies
            .iter()
            .any(|p| p.name() == spec.id.name())
    );
}

#[test]
fn invalid_data_is_not_reported_healthy() {
    let mut patient = cell();
    patient
        .clinical
        .markers
        .insert("insulin_resistance".into(), 1.5);
    assert!(diagnose_markers(&patient.clinical).is_empty());
    let report = assess_agent_clinical_status(&patient);
    assert!(!report.is_healthy);
    assert_eq!(report.invalid_markers, vec!["insulin_resistance"]);
    assert!(patient.clinical.active_pathologies.is_empty());
}

#[test]
fn side_effects_are_measured_bounded_and_reported() {
    let mut patient = cell();
    patient
        .clinical
        .markers
        .insert("metal_toxin_load".into(), 0.75);
    patient
        .clinical
        .markers
        .insert("cofactor_deficit".into(), 0.98);
    let outcome = apply_systemic_therapy_to_cell(&SystemicTherapy::ChelationTherapy, &mut patient);
    assert_eq!(patient.clinical.markers["cofactor_deficit"], 1.0);
    assert_eq!(outcome.induced_side_effects.len(), 1);
    assert_eq!(outcome.marker_changes.len(), 2);
    assert_eq!(
        outcome.induced_side_effects[0].category(),
        genos_cell::DiseaseCategory::Iatrogenic
    );
}

#[test]
fn unsafe_thrombolysis_is_refused_and_not_recommended() {
    let mut patient = cell();
    patient
        .clinical
        .markers
        .insert("vascular_occlusion".into(), 0.75);
    patient
        .clinical
        .markers
        .insert("blood_brain_barrier_integrity".into(), 0.5);
    assert!(
        !proposed_therapies(&patient).contains(&SystemicTherapy::CoronaryReperfusionThrombolysis)
    );
    assert_eq!(
        apply_systemic_therapy_to_cell(
            &SystemicTherapy::CoronaryReperfusionThrombolysis,
            &mut patient
        )
        .status,
        TherapyStatus::Refused
    );
    assert_eq!(patient.clinical.markers["vascular_occlusion"], 0.75);
}

#[test]
fn antiseptic_requires_the_matching_pathogen() {
    let mut patient = cell();
    patient.clinical.diagnose(Pathology::CrossContamination {
        source_capsule: "c".into(),
        pathogen_signature: "actual".into(),
    });
    let wrong = SystemicTherapy::AntisepticPurge {
        target_signature: "wrong".into(),
    };
    assert_eq!(
        apply_systemic_therapy_to_cell(&wrong, &mut patient).status,
        TherapyStatus::NoTarget
    );
    assert_eq!(patient.clinical.active_pathologies.len(), 1);
}
