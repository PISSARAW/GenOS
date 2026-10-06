use genos_biology::pathology::{Pathology, assess_agent_clinical_status};
use genos_biology::therapy::{
    SystemicTherapy, TherapyOutcome, TherapyStatus, apply_systemic_therapy_to_cell,
};
use genos_cell::AgentCell;

fn patient() -> AgentCell {
    AgentCell::new("Nosologie", "Simulation", "Worker")
}

#[test]
fn zero_dose_preserves_diagnosis_and_inflammation() {
    let mut cell = patient();
    cell.clinical.inflammatory_index = 0.75;
    cell.clinical
        .diagnose(Pathology::CytokineStorm { il6_level: 12.0 });
    let result = apply_systemic_therapy_to_cell(&SystemicTherapy::Corticosteroids(0.0), &mut cell);
    assert_eq!(result.status, TherapyStatus::NoTarget);
    assert_eq!(cell.clinical.inflammatory_index, 0.75);
    assert_eq!(cell.clinical.active_pathologies.len(), 1);
}

#[test]
fn invalid_inflammation_is_refused_without_sanitizing_it() {
    for value in [f64::NAN, f64::INFINITY, -0.1, 1.1] {
        let mut cell = patient();
        cell.clinical.inflammatory_index = value;
        let result = apply_systemic_therapy_to_cell(&SystemicTherapy::Tocilizumab, &mut cell);
        assert_eq!(result.status, TherapyStatus::Refused);
        assert_eq!(cell.clinical.inflammatory_index.to_bits(), value.to_bits());
    }
}

#[test]
fn antiseptic_preserves_other_pathogen_and_quarantine() {
    let mut cell = patient();
    for signature in ["one", "two"] {
        cell.clinical.diagnose(Pathology::CrossContamination {
            source_capsule: "capsule".into(),
            pathogen_signature: signature.into(),
        });
    }
    assert_eq!(cell.clinical.active_pathologies.len(), 2);
    cell.clinical.isolate("test");
    let result = apply_systemic_therapy_to_cell(
        &SystemicTherapy::AntisepticPurge {
            target_signature: "one".into(),
        },
        &mut cell,
    );
    assert_eq!(result.status, TherapyStatus::Applied);
    assert_eq!(cell.clinical.active_pathologies.len(), 1);
    assert!(matches!(&cell.clinical.active_pathologies[0],
        Pathology::CrossContamination { pathogen_signature, .. } if pathogen_signature == "two"));
    assert!(cell.clinical.is_quarantined);
}

#[test]
fn replacing_scars_cannot_claim_memory_repair() {
    let mut cell = patient();
    cell.clinical.diagnose(Pathology::PrionAggregation {
        dissonance_score: 1.0,
    });
    let result = apply_systemic_therapy_to_cell(&SystemicTherapy::StemCellReplacement, &mut cell);
    assert!(result.cured_pathologies.is_empty());
    assert_eq!(cell.clinical.active_pathologies.len(), 1);
}

#[test]
fn detox_does_not_erase_persistent_marker_side_effect() {
    let mut cell = patient();
    cell.clinical.markers.insert("cofactor_deficit".into(), 0.9);
    cell.clinical.diagnose(Pathology::TherapyAdverseEffect {
        therapy: "ChelationTherapy".into(),
        marker: "cofactor_deficit".into(),
        severity: 0.9,
    });
    let result = apply_systemic_therapy_to_cell(&SystemicTherapy::DetoxificationWashout, &mut cell);
    assert_eq!(result.status, TherapyStatus::NoTarget);
    assert_eq!(cell.clinical.active_pathologies.len(), 1);
    assert_eq!(cell.clinical.markers["cofactor_deficit"], 0.9);
}

#[test]
fn legacy_outcome_without_status_never_attests_application() {
    let result: TherapyOutcome = serde_json::from_value(serde_json::json!({
        "therapy_name": "Legacy", "cured_pathologies": [], "applied_markers": [],
        "induced_side_effects": [], "message": "logged"
    }))
    .unwrap();
    assert_eq!(result.status, TherapyStatus::Unspecified);
    assert!(result.marker_changes.is_empty());
}

#[test]
fn report_refreshes_measured_severity_without_mutating_patient() {
    let mut cell = patient();
    cell.clinical
        .markers
        .insert("insulin_resistance".into(), 0.75);
    genos_biology::nosology::synchronize_diagnoses(&mut cell);
    cell.clinical
        .markers
        .insert("insulin_resistance".into(), 0.9);
    let report = assess_agent_clinical_status(&cell);
    assert!(
        matches!(report.active_pathologies[0], Pathology::Nosological { severity, .. } if severity == 0.9)
    );
    assert!(
        matches!(cell.clinical.active_pathologies[0], Pathology::Nosological { severity, .. } if severity == 0.75)
    );
}
