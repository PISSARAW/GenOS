use crate::therapy::{MarkerChange, SystemicTherapy, TherapyOutcome, TherapyStatus};
use genos_cell::AgentCell;

pub fn apply_systemic_therapy_to_cell(
    therapy: &SystemicTherapy,
    cell: &mut AgentCell,
) -> TherapyOutcome {
    let name = format!("{:?}", therapy);
    let mut outcome = empty_outcome(name);
    if let Some(reason) = crate::therapy_extended::safety_block(therapy, cell) {
        outcome.status = TherapyStatus::Refused;
        outcome.message = format!("Traitement refusé: {}", reason);
        cell.clinical.clinical_log.push(outcome.message.clone());
        return outcome;
    }
    let before = cell.clone();
    crate::therapy_legacy::apply(therapy, cell, &mut outcome);
    if let Some((markers, effects)) = crate::therapy_extended::apply_extended_therapy(therapy, cell)
    {
        outcome.applied_markers.extend(markers);
        outcome.induced_side_effects.extend(effects);
    }
    for (marker, value) in &cell.clinical.markers {
        let old = before.clinical.markers.get(marker).copied();
        if old != Some(*value) && value.is_finite() {
            outcome.marker_changes.push(MarkerChange {
                marker: marker.clone(),
                before: old,
                after: *value,
            });
        }
    }
    let affected: Vec<_> = outcome
        .marker_changes
        .iter()
        .map(|change| change.marker.clone())
        .collect();
    outcome
        .cured_pathologies
        .extend(crate::nosology::resolve_affected(cell, &affected));
    finish(&before, cell, &mut outcome);
    outcome
}

fn empty_outcome(name: String) -> TherapyOutcome {
    TherapyOutcome {
        therapy_name: name,
        cured_pathologies: Vec::new(),
        applied_markers: Vec::new(),
        induced_side_effects: Vec::new(),
        message: String::new(),
        status: TherapyStatus::NoTarget,
        marker_changes: Vec::new(),
    }
}

fn finish(before: &AgentCell, cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    if !has_effect(before, cell) {
        outcome.message = format!("Aucune cible correspondante pour {}", cell.name);
        cell.clinical.clinical_log.push(outcome.message.clone());
        return;
    }
    outcome.status = TherapyStatus::Applied;
    cell.clinical.last_treatment_applied = Some(outcome.therapy_name.clone());
    outcome.message = format!("Traitement appliqué pour {}", cell.name);
    cell.clinical
        .clinical_log
        .push(format!("Traitement administré: {}", outcome.therapy_name));
}

fn has_effect(before: &AgentCell, cell: &AgentCell) -> bool {
    let old = &before.clinical;
    let now = &cell.clinical;
    serde_json::to_value(&old.active_pathologies).ok()
        != serde_json::to_value(&now.active_pathologies).ok()
        || markers_changed(old, now)
        || old.inflammatory_index.to_bits() != now.inflammatory_index.to_bits()
        || old.is_quarantined != now.is_quarantined
        || before.bud_scar_ids != cell.bud_scar_ids
        || before.bud_scars != cell.bud_scars
        || before.is_senescent != cell.is_senescent
        || before.hayflick_limit != cell.hayflick_limit
}

fn markers_changed(old: &genos_cell::ClinicalState, now: &genos_cell::ClinicalState) -> bool {
    old.markers.len() != now.markers.len()
        || old
            .markers
            .iter()
            .any(|(key, value)| now.markers.get(key).map(|v| v.to_bits()) != Some(value.to_bits()))
}
