use crate::pathology::Pathology;
use crate::therapy::SystemicTherapy;
use genos_cell::AgentCell;

const LOWER: f64 = 0.0;
const UPPER: f64 = 1.0;

pub fn safety_block(therapy: &SystemicTherapy, cell: &AgentCell) -> Option<String> {
    if matches!(therapy, SystemicTherapy::CoronaryReperfusionThrombolysis) {
        let Some(bbb) = cell.clinical.markers.get("blood_brain_barrier_integrity") else {
            return Some("intégrité de la BHE non renseignée".to_string());
        };
        if !bbb.is_finite() || !(0.0..=1.0).contains(bbb) || *bbb <= 0.5 {
            return Some("intégrité de la BHE absente, invalide ou ≤ 0.5".to_string());
        }
    }
    None
}

pub fn reduce_marker(marker: &mut f64, amount: f64) {
    if marker.is_finite() && amount.is_finite() && (LOWER..=UPPER).contains(marker) && amount > 0.0
    {
        *marker = (*marker - amount.min(UPPER)).max(LOWER);
    }
}

pub fn apply_extended_therapy(
    therapy: &SystemicTherapy,
    cell: &mut AgentCell,
) -> Option<(Vec<String>, Vec<Pathology>)> {
    let (marker, amount) = match therapy {
        SystemicTherapy::InsulinSensitizerMetformin => ("insulin_resistance", 0.25),
        SystemicTherapy::LevothyroxineHormoneReplacement => ("thyroid_signal_deficit", 0.25),
        SystemicTherapy::ColchicineInhibition => ("purine_inflammation", 0.25),
        SystemicTherapy::AllopurinolXanthineInhibitor => ("purine_production", 0.25),
        SystemicTherapy::LysosomalUraturicPurge => ("purine_waste_load", 0.25),
        SystemicTherapy::CoronaryReperfusionThrombolysis => ("vascular_occlusion", 0.25),
        SystemicTherapy::VasodilatorFlowControl => ("vascular_resistance", 0.25),
        SystemicTherapy::AntiAdhesionVasodilator => ("vascular_adhesion", 0.25),
        SystemicTherapy::AntiNmdReadthrough => ("nmda_signal_deficit", 0.25),
        SystemicTherapy::NeuroprotectiveAstrocyticFlush => ("astrocytic_waste_load", 0.25),
        SystemicTherapy::BloodBrainBarrierSealant => ("blood_brain_barrier_deficit", 0.25),
        SystemicTherapy::LevodopaSupplementation => ("dopamine_signal_deficit", 0.25),
        SystemicTherapy::DeepBrainStimulation => ("neural_activity_instability", 0.25),
        SystemicTherapy::Viscosupplementation => ("joint_friction", 0.25),
        SystemicTherapy::SenolyticPurge => ("senescent_load", 0.25),
        _ => return None,
    };
    let Some(value) = cell.clinical.markers.get_mut(marker) else {
        return Some((Vec::new(), Vec::new()));
    };
    if !value.is_finite() || !(LOWER..=UPPER).contains(value) || *value <= LOWER {
        return Some((Vec::new(), Vec::new()));
    }
    reduce_marker(value, amount);
    let result = vec![format!("{} réduit", marker)];
    cell.clinical
        .clinical_log
        .push(format!("Marqueur computationnel réduit: {}", marker));
    Some((result, Vec::new()))
}
