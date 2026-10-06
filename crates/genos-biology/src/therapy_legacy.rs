use crate::pathology::Pathology;
use crate::therapy::{SystemicTherapy, TherapyOutcome};
use genos_cell::AgentCell;

pub fn apply(therapy: &SystemicTherapy, cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    match therapy {
        SystemicTherapy::Tocilizumab
        | SystemicTherapy::Corticosteroids(_)
        | SystemicTherapy::ImmunosuppressiveWash
        | SystemicTherapy::SelfToleranceRecalibration => immune(therapy, cell, outcome),
        SystemicTherapy::QuarantineIsolation { .. }
        | SystemicTherapy::AntisepticPurge { .. }
        | SystemicTherapy::Antiviral
        | SystemicTherapy::Vaccine(_) => infection(therapy, cell, outcome),
        SystemicTherapy::DetoxificationWashout
        | SystemicTherapy::AntidoteAdmin { .. }
        | SystemicTherapy::HomeostaticDoseCorrection => detox(therapy, cell, outcome),
        SystemicTherapy::TelomeraseActivation { .. } | SystemicTherapy::StemCellReplacement => {
            regeneration(therapy, cell, outcome)
        }
        _ => {}
    }
}

fn cure(cell: &mut AgentCell, names: &[&str], outcome: &mut TherapyOutcome) {
    for name in names {
        if cell.clinical.cure_pathology_by_name(name) {
            outcome.cured_pathologies.push((*name).into());
        }
    }
}

fn immune(therapy: &SystemicTherapy, cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    match therapy {
        SystemicTherapy::Tocilizumab => {
            cure_storm(cell, outcome);
            cell.clinical.inflammatory_index = (cell.clinical.inflammatory_index - 0.5).max(0.0);
        }
        SystemicTherapy::Corticosteroids(dose) => {
            if *dose == 0.0 {
                return;
            }
            cure_storm(cell, outcome);
            cell.clinical.inflammatory_index =
                (cell.clinical.inflammatory_index - dose * 0.8).max(0.0);
            if *dose > 0.8 {
                let coma = Pathology::SteroidInducedComa {
                    administered_dose: *dose,
                };
                cell.clinical.diagnose(coma.clone());
                outcome.induced_side_effects.push(coma);
            }
        }
        _ => {
            cure(
                cell,
                &["Hyperactivation Macrophagique", "Ciblage Auto-Immun"],
                outcome,
            );
            cell.clinical.inflammatory_index = 0.0;
        }
    }
}

fn cure_storm(cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    if cell
        .clinical
        .cure_pathology_by_name("Orage Cytokinique (IL-6 Storm)")
    {
        outcome.cured_pathologies.push("Orage Cytokinique".into());
    }
}

fn infection(therapy: &SystemicTherapy, cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    match therapy {
        SystemicTherapy::QuarantineIsolation { capsule_id } => {
            if !capsule_id.trim().is_empty() {
                cell.clinical
                    .isolate(&format!("Isolement capsule {}", capsule_id));
            }
        }
        SystemicTherapy::AntisepticPurge { target_signature } => {
            antiseptic(cell, target_signature, outcome)
        }
        SystemicTherapy::Antiviral => cure(cell, &["Infection Virale Exogène"], outcome),
        SystemicTherapy::Vaccine(spike) => {
            if !spike.trim().is_empty() {
                let key = format!("vaccine_immunity:{}", spike);
                let value = cell.clinical.markers.entry(key).or_default();
                if crate::nosology_catalog::normalized(*value) {
                    *value = (*value + 0.25).min(1.0);
                }
            }
        }
        _ => {}
    }
}

fn antiseptic(cell: &mut AgentCell, signature: &str, outcome: &mut TherapyOutcome) {
    let before = cell.clinical.active_pathologies.len();
    cell.clinical.active_pathologies.retain(|pathology| {
        let matched = matches_signature(pathology, signature);
        if matched {
            outcome.cured_pathologies.push(pathology.name().into());
        }
        !matched
    });
    if before != cell.clinical.active_pathologies.len()
        && cell.clinical.active_pathologies.is_empty()
    {
        cell.clinical.discharge();
    }
}

fn matches_signature(pathology: &Pathology, signature: &str) -> bool {
    match pathology {
        Pathology::CrossContamination {
            pathogen_signature, ..
        } => pathogen_signature == signature,
        Pathology::HospitalAcquiredInfection { origin_facility } => origin_facility == signature,
        _ => false,
    }
}

fn detox(therapy: &SystemicTherapy, cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    match therapy {
        SystemicTherapy::DetoxificationWashout => cure(
            cell,
            &[
                "Coma Stéroïdien Iatrogène",
                "Blocage Récepteur Persistant",
                "Dommage Collatéral Antibiotique",
                "Dérive Cognitive Iatrogène",
            ],
            outcome,
        ),
        SystemicTherapy::AntidoteAdmin { target_drug } => match target_drug.as_str() {
            "Corticosteroids" => cure(cell, &["Coma Stéroïdien Iatrogène"], outcome),
            "Tocilizumab" => cure(cell, &["Blocage Récepteur Persistant"], outcome),
            _ => {}
        },
        SystemicTherapy::HomeostaticDoseCorrection => {
            cure(cell, &["Coma Stéroïdien Iatrogène"], outcome)
        }
        _ => {}
    }
}

fn regeneration(therapy: &SystemicTherapy, cell: &mut AgentCell, outcome: &mut TherapyOutcome) {
    match therapy {
        SystemicTherapy::TelomeraseActivation { extended_ticks } => {
            cell.hayflick_limit = cell.hayflick_limit.saturating_add(*extended_ticks);
            if cell.bud_scars < cell.hayflick_limit && *extended_ticks > 0 {
                cell.is_senescent = false;
                cure(
                    cell,
                    &["Épuisement Télomérique", "Sénescence Réplicative"],
                    outcome,
                );
            }
        }
        SystemicTherapy::StemCellReplacement => {
            cell.bud_scars = 0;
            cell.bud_scar_ids.clear();
            cell.is_senescent = false;
            cure(
                cell,
                &["Épuisement Télomérique", "Sénescence Réplicative"],
                outcome,
            );
        }
        _ => {}
    }
}
