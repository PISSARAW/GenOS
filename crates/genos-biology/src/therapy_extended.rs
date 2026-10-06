use crate::nosology_catalog::{normalized, therapy_spec};
use crate::pathology::Pathology;
use crate::therapy::SystemicTherapy;
use genos_cell::AgentCell;

pub fn safety_block(therapy: &SystemicTherapy, cell: &AgentCell) -> Option<String> {
    if !cell.is_alive() {
        return Some("cellule apoptotique".into());
    }
    if invalid_parameters(therapy) {
        return Some("paramètres invalides".into());
    }
    if invalid_inflammation(therapy, cell) {
        return Some("indice inflammatoire invalide".into());
    }
    let spec = therapy_spec(therapy)?;
    for guard in &spec.guards {
        let value = cell.clinical.markers.get(&guard.marker);
        if !value.is_some_and(|v| normalized(*v) && *v > guard.min) {
            return Some(format!(
                "garde {}: valeur valide > {} requise",
                guard.marker, guard.min
            ));
        }
    }
    invalid_risk(spec, cell)
}

fn invalid_inflammation(therapy: &SystemicTherapy, cell: &AgentCell) -> bool {
    matches!(
        therapy,
        SystemicTherapy::Tocilizumab
            | SystemicTherapy::Corticosteroids(_)
            | SystemicTherapy::ImmunosuppressiveWash
            | SystemicTherapy::SelfToleranceRecalibration
    ) && !normalized(cell.clinical.inflammatory_index)
}

fn invalid_parameters(therapy: &SystemicTherapy) -> bool {
    match therapy {
        SystemicTherapy::Corticosteroids(dose) => !dose.is_finite() || *dose < 0.0 || *dose > 1.0,
        SystemicTherapy::Vaccine(signature)
        | SystemicTherapy::QuarantineIsolation {
            capsule_id: signature,
        }
        | SystemicTherapy::AntisepticPurge {
            target_signature: signature,
        }
        | SystemicTherapy::AntidoteAdmin {
            target_drug: signature,
        } => signature.trim().is_empty(),
        _ => false,
    }
}

fn invalid_risk(spec: &crate::nosology_catalog::TherapySpec, cell: &AgentCell) -> Option<String> {
    spec.side_effects
        .iter()
        .find(|effect| {
            cell.clinical
                .markers
                .get(&effect.marker)
                .is_some_and(|value| !normalized(*value))
        })
        .map(|effect| format!("marqueur de risque invalide: {}", effect.marker))
}

pub fn reduce_marker(marker: &mut f64, amount: f64) {
    if normalized(*marker) && amount.is_finite() && amount > 0.0 {
        *marker = (*marker - amount.min(1.0)).max(0.0);
    }
}

pub fn apply_extended_therapy(
    therapy: &SystemicTherapy,
    cell: &mut AgentCell,
) -> Option<(Vec<String>, Vec<Pathology>)> {
    let spec = therapy_spec(therapy)?;
    let mut applied = Vec::new();
    for marker in &spec.targets {
        if let Some(value) = cell.clinical.markers.get_mut(marker) {
            let before = *value;
            reduce_marker(value, spec.amount);
            if before.is_finite() && *value < before {
                applied.push(format!("{} réduit", marker));
            }
        }
    }
    let effects = if applied.is_empty() {
        Vec::new()
    } else {
        apply_risks(spec, cell)
    };
    Some((applied, effects))
}

fn apply_risks(
    spec: &crate::nosology_catalog::TherapySpec,
    cell: &mut AgentCell,
) -> Vec<Pathology> {
    let mut effects = Vec::new();
    for risk in &spec.side_effects {
        let Some(value) = cell.clinical.markers.get_mut(&risk.marker) else {
            continue;
        };
        let before = *value;
        *value = (*value + risk.amount).min(1.0);
        if *value > before {
            let effect = Pathology::TherapyAdverseEffect {
                therapy: spec.id.clone(),
                marker: risk.marker.clone(),
                severity: *value,
            };
            cell.clinical
                .clinical_log
                .push(format!("Effet secondaire simulé: {}", risk.marker));
            cell.clinical.diagnose(effect.clone());
            effects.push(effect);
        }
    }
    effects
}
