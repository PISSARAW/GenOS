use crate::pathology::{DiseaseCategory, Pathology};
use genos_cell::AgentCell;
use serde::{Deserialize, Serialize};

/// Les Thérapies Médicales ciblées pour soigner les agents cancéreux ou anormaux
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Therapy {
    TargetedTherapy,
    Immunotherapy,
    AntiAngiogenesis,
    CellCycleInhibitor,
    /// Détoxification ciblée d'un agent
    TargetedDetoxification,
    /// Induction d'apoptose douce
    InducedApoptosis,
}

/// Traitements systémiques administrés à l'ensemble du système ou d'une capsule
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SystemicTherapy {
    // --- Traitements de Base & Infectieux ---
    Tocilizumab,
    Corticosteroids(f64),
    IntensiveCareFluids,
    Antibiotic,
    Antiviral,
    Vaccine(String),

    // --- Remèdes Auto-Immuns ---
    /// Lavage immunosuppresseur pour purger les cytokines en circulation
    ImmunosuppressiveWash,
    /// Réétalonnage des détecteurs d'anticorps auto-réactifs
    SelfToleranceRecalibration,

    // --- Remèdes Nosocomiaux ---
    /// Mise en quarantaine étanche de la capsule
    QuarantineIsolation {
        capsule_id: String,
    },
    /// Purge antiseptique et stérilisation du milieu partagé
    AntisepticPurge {
        target_signature: String,
    },

    // --- Remèdes Iatrogènes ---
    /// Lavage et élimination des résidus de stéroïdes ou surdosages
    DetoxificationWashout,
    /// Administration d'un antidote spécifique contre un traitement bloquant
    AntidoteAdmin {
        target_drug: String,
    },
    /// Correction homéostatique du dosage
    HomeostaticDoseCorrection,

    // --- Remèdes Dégénératifs & Sénescence ---
    /// Réactivation de la télomérase (restaure une partie du potentiel de division)
    TelomeraseActivation {
        extended_ticks: u32,
    },
    /// Remplacement cellulaire par cellules souches fraîches (apoptose douce + instanciation neuve)
    StemCellReplacement,

    // Opérateurs métaboliques computationnels proposés.
    InsulinSensitizerMetformin,
    LevothyroxineHormoneReplacement,
    ColchicineInhibition,
    AllopurinolXanthineInhibitor,
    LysosomalUraturicPurge,

    // Opérateurs vasculaires et neurologiques proposés.
    CoronaryReperfusionThrombolysis,
    VasodilatorFlowControl,
    AntiAdhesionVasodilator,
    AntiNmdReadthrough,
    NeuroprotectiveAstrocyticFlush,
    BloodBrainBarrierSealant,

    // Opérateurs dégénératifs et musculosquelettiques proposés.
    LevodopaSupplementation,
    DeepBrainStimulation,
    Viscosupplementation,
    SenolyticPurge,

    // Opérateurs infectieux, génétiques, oncologiques et psychiatriques proposés.
    AntiretroviralCombination,
    AntimalarialACT,
    ExonSkippingAntisense,
    CFTRModulatorTriad,
    CartCellInfusion,
    KetamineRapidInfusion,
    MoodStabilizerLithium,
    AntipsychoticAtypical,
    FetalCarrierReactivation,
}

/// Résultat de l'application d'un traitement
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct TherapyOutcome {
    pub therapy_name: String,
    pub cured_pathologies: Vec<String>,
    #[serde(default)]
    pub applied_markers: Vec<String>,
    pub induced_side_effects: Vec<Pathology>,
    pub message: String,
}

/// Applique une thérapie systémique directement sur une cellule
pub fn apply_systemic_therapy_to_cell(
    therapy: &SystemicTherapy,
    cell: &mut AgentCell,
) -> TherapyOutcome {
    let mut cured = Vec::new();
    let mut side_effects = Vec::new();
    let therapy_name = format!("{:?}", therapy);

    if let Some(reason) = crate::therapy_extended::safety_block(therapy, cell) {
        cell.clinical.last_treatment_applied = Some(therapy_name.clone());
        cell.clinical
            .clinical_log
            .push(format!("Refus de traitement {}: {}", therapy_name, reason));
        return TherapyOutcome {
            therapy_name,
            cured_pathologies: Vec::new(),
            applied_markers: Vec::new(),
            induced_side_effects: Vec::new(),
            message: format!("Traitement refusé: {}", reason),
        };
    }
    if let Some((cured_pathologies, induced_side_effects)) =
        crate::therapy_extended::apply_extended_therapy(therapy, cell)
    {
        cell.clinical.last_treatment_applied = Some(therapy_name.clone());
        cell.clinical
            .clinical_log
            .push(format!("Traitement administré: {}", therapy_name));
        let message = if cured_pathologies.is_empty() {
            format!("Aucune cible correspondante pour {}", cell.name)
        } else {
            format!("Marqueur ciblé modifié pour {}", cell.name)
        };
        return TherapyOutcome {
            therapy_name,
            cured_pathologies: Vec::new(),
            applied_markers: cured_pathologies,
            induced_side_effects,
            message,
        };
    }
    cell.clinical.last_treatment_applied = Some(therapy_name.clone());
    cell.clinical
        .clinical_log
        .push(format!("Traitement administré: {}", therapy_name));

    match therapy {
        SystemicTherapy::Tocilizumab => {
            if cell
                .clinical
                .cure_pathology_by_name("Orage Cytokinique (IL-6 Storm)")
            {
                cured.push("Orage Cytokinique".to_string());
            }
            cell.clinical.inflammatory_index = (cell.clinical.inflammatory_index - 0.5).max(0.0);
        }
        SystemicTherapy::Corticosteroids(dose) => {
            let d = *dose;
            if cell
                .clinical
                .cure_pathology_by_name("Orage Cytokinique (IL-6 Storm)")
            {
                cured.push("Orage Cytokinique".to_string());
            }
            cell.clinical.inflammatory_index =
                (cell.clinical.inflammatory_index - (d * 0.8)).max(0.0);

            // Risque Iatrogène si surdose > 0.8
            if d > 0.8 {
                let coma = Pathology::SteroidInducedComa {
                    administered_dose: d,
                };
                cell.clinical.diagnose(coma.clone());
                side_effects.push(coma);
            }
        }
        SystemicTherapy::ImmunosuppressiveWash | SystemicTherapy::SelfToleranceRecalibration => {
            if cell
                .clinical
                .cure_pathology_by_name("Hyperactivation Macrophagique")
            {
                cured.push("Hyperactivation Macrophagique".to_string());
            }
            if cell.clinical.cure_pathology_by_name("Ciblage Auto-Immun") {
                cured.push("Ciblage Auto-Immun".to_string());
            }
            cell.clinical.inflammatory_index = 0.0;
        }
        SystemicTherapy::QuarantineIsolation { capsule_id } => {
            cell.clinical
                .isolate(&format!("Isolement capsule {}", capsule_id));
        }
        SystemicTherapy::AntisepticPurge { target_signature } => {
            if cell
                .clinical
                .cure_pathology_by_name("Contamination Croisée Nosocomiale")
            {
                cured.push(format!("Contamination Croisée ({})", target_signature));
            }
            if cell
                .clinical
                .cure_pathology_by_name("Infection Nosocomiale de Capsule")
            {
                cured.push("Infection Nosocomiale".to_string());
            }
            if cell.clinical.active_pathologies.is_empty() {
                cell.clinical.discharge();
            }
        }
        SystemicTherapy::DetoxificationWashout => {
            if cell
                .clinical
                .cure_pathology_by_name("Coma Stéroïdien Iatrogène")
            {
                cured.push("Coma Stéroïdien Iatrogène".to_string());
            }
            if cell
                .clinical
                .cure_pathology_by_name("Blocage Récepteur Persistant")
            {
                cured.push("Blocage Récepteur Persistant".to_string());
            }
            if cell
                .clinical
                .cure_pathology_by_name("Dommage Collatéral Antibiotique")
            {
                cured.push("Dommage Collatéral Antibiotique".to_string());
            }
            cell.clinical
                .clinical_log
                .push("Détoxification systémique complétée".to_string());
        }
        SystemicTherapy::AntidoteAdmin { target_drug } => {
            cell.clinical
                .cure_pathology_by_name("Coma Stéroïdien Iatrogène");
            cell.clinical
                .cure_pathology_by_name("Blocage Récepteur Persistant");
            cured.push(format!("Antidote contre {}", target_drug));
        }
        SystemicTherapy::HomeostaticDoseCorrection => {
            cell.clinical
                .cure_pathology_by_name("Coma Stéroïdien Iatrogène");
            cell.clinical
                .clinical_log
                .push("Dose réajustée aux niveaux homéostatiques".to_string());
        }
        SystemicTherapy::TelomeraseActivation { extended_ticks } => {
            cell.hayflick_limit = cell.hayflick_limit.saturating_add(*extended_ticks);
            cell.is_senescent = false;
            if cell
                .clinical
                .cure_pathology_by_name("Épuisement Télomérique")
            {
                cured.push("Épuisement Télomérique".to_string());
            }
            if cell
                .clinical
                .cure_pathology_by_name("Sénescence Réplicative")
            {
                cured.push("Sénescence Réplicative".to_string());
            }
        }
        SystemicTherapy::StemCellReplacement => {
            cell.bud_scars = 0;
            cell.is_senescent = false;
            cell.clinical
                .active_pathologies
                .retain(|p| p.category() != DiseaseCategory::Degenerative);
            cured.push("Régénération complète par cellule souche".to_string());
            cell.clinical
                .clinical_log
                .push("Remplacement par cellule souche effectué".to_string());
        }
        SystemicTherapy::IntensiveCareFluids => {
            cell.clinical
                .clinical_log
                .push("Perfusion de réanimation administrée".to_string());
        }
        SystemicTherapy::Antibiotic => {
            cell.clinical
                .clinical_log
                .push("Traitement antibiotique large spectre administré".to_string());
        }
        SystemicTherapy::Antiviral => {
            if cell
                .clinical
                .cure_pathology_by_name("Infection Virale Exogène")
            {
                cured.push("Infection Virale Exogène".to_string());
            }
            cell.clinical
                .clinical_log
                .push("Traitement antiviral administré".to_string());
        }
        SystemicTherapy::InsulinSensitizerMetformin
        | SystemicTherapy::LevothyroxineHormoneReplacement
        | SystemicTherapy::ColchicineInhibition
        | SystemicTherapy::AllopurinolXanthineInhibitor
        | SystemicTherapy::LysosomalUraturicPurge
        | SystemicTherapy::CoronaryReperfusionThrombolysis
        | SystemicTherapy::VasodilatorFlowControl
        | SystemicTherapy::AntiAdhesionVasodilator
        | SystemicTherapy::AntiNmdReadthrough
        | SystemicTherapy::NeuroprotectiveAstrocyticFlush
        | SystemicTherapy::BloodBrainBarrierSealant
        | SystemicTherapy::LevodopaSupplementation
        | SystemicTherapy::DeepBrainStimulation
        | SystemicTherapy::Viscosupplementation
        | SystemicTherapy::SenolyticPurge
        | SystemicTherapy::AntiretroviralCombination
        | SystemicTherapy::AntimalarialACT
        | SystemicTherapy::ExonSkippingAntisense
        | SystemicTherapy::CFTRModulatorTriad
        | SystemicTherapy::CartCellInfusion
        | SystemicTherapy::KetamineRapidInfusion
        | SystemicTherapy::MoodStabilizerLithium
        | SystemicTherapy::AntipsychoticAtypical
        | SystemicTherapy::FetalCarrierReactivation => unreachable!("géré par therapy_extended"),
        SystemicTherapy::Vaccine(spike) => {
            cell.clinical
                .clinical_log
                .push(format!("Vaccination effectuée contre {}", spike));
        }
    }

    TherapyOutcome {
        therapy_name,
        cured_pathologies: cured,
        applied_markers: Vec::new(),
        induced_side_effects: side_effects,
        message: format!("Traitement complété pour l'agent {}", cell.name),
    }
}
