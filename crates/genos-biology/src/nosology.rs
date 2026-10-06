use crate::nosology_catalog::{catalog, condition_spec, normalized, therapy_spec};
use crate::pathology::Pathology;
use crate::therapy::SystemicTherapy;
use genos_cell::{AgentCell, ClinicalState};

/// Détecte uniquement les conditions attestées par un marqueur normalisé > seuil.
pub fn diagnose_markers(state: &ClinicalState) -> Vec<Pathology> {
    catalog()
        .conditions
        .iter()
        .filter_map(|spec| {
            let severity = spec
                .markers
                .iter()
                .filter_map(|key| state.markers.get(key).copied())
                .filter(|value| normalized(*value))
                .fold(0.0_f64, f64::max);
            (severity > spec.threshold).then_some(Pathology::Nosological {
                condition: spec.id,
                severity,
            })
        })
        .collect()
}

/// Recommandations logicielles; aucun traitement n'est administré par cette fonction.
pub fn proposed_therapies(cell: &AgentCell) -> Vec<SystemicTherapy> {
    let mut proposed = Vec::new();
    for pathology in diagnose_markers(&cell.clinical) {
        if let Pathology::Nosological { condition, .. } = pathology {
            for name in &condition_spec(condition).therapies {
                let therapy: SystemicTherapy = serde_json::from_value(serde_json::json!(name))
                    .expect("thérapie intégrée au catalogue");
                if applicable(&therapy, cell) && !proposed.contains(&therapy) {
                    proposed.push(therapy);
                }
            }
        }
    }
    proposed
}

fn applicable(therapy: &SystemicTherapy, cell: &AgentCell) -> bool {
    let Some(spec) = therapy_spec(therapy) else {
        return false;
    };
    spec.targets.iter().any(|key| {
        cell.clinical
            .markers
            .get(key)
            .is_some_and(|v| normalized(*v) && *v > 0.5)
    }) && crate::therapy_extended::safety_block(therapy, cell).is_none()
}

pub fn invalid_markers(state: &ClinicalState) -> Vec<String> {
    state
        .markers
        .iter()
        .filter(|(_, value)| !normalized(**value))
        .map(|(name, _)| name.clone())
        .collect()
}

/// Synchronise les diagnostics; une cible disparue ne prouve jamais une rémission.
pub fn synchronize_diagnoses(cell: &mut AgentCell) {
    for pathology in diagnose_markers(&cell.clinical) {
        cell.clinical.diagnose(pathology);
    }
}

/// Ne retire que les conditions existantes entièrement mesurées et résolues par l'action.
pub fn resolve_affected(cell: &mut AgentCell, markers: &[String]) -> Vec<String> {
    let resolved: Vec<_> = cell
        .clinical
        .active_pathologies
        .iter()
        .filter_map(|p| {
            let Pathology::Nosological { condition, .. } = p else {
                return None;
            };
            let spec = condition_spec(*condition);
            let targeted = spec.markers.iter().any(|m| markers.contains(m));
            let resolved = spec.markers.iter().all(|m| {
                cell.clinical
                    .markers
                    .get(m)
                    .is_some_and(|v| normalized(*v) && *v <= spec.threshold)
            });
            (targeted && resolved).then_some(condition.name().to_string())
        })
        .collect();
    for name in &resolved {
        cell.clinical.cure_pathology_by_name(name);
    }
    resolved
}
