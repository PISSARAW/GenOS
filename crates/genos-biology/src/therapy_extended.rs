use crate::pathology::Pathology;
use crate::therapy::SystemicTherapy;
use genos_cell::AgentCell;

const LOWER: f64 = 0.0;
const UPPER: f64 = 1.0;

pub fn safety_block(_therapy: &SystemicTherapy, _cell: &AgentCell) -> Option<String> {
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
