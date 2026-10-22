use crate::therapy::SystemicTherapy;
use genos_cell::clinical::DiseaseCategory;
use genos_cell::nosology::NosologicalCondition;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct NosologyCatalog {
    pub schema: String,
    pub calibration: CalibrationMetadata,
    pub conditions: Vec<ConditionSpec>,
    pub therapies: Vec<TherapySpec>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CalibrationMetadata {
    pub schema: String,
    pub status: String,
    pub condition_thresholds: ParameterCalibration,
    pub therapy_amounts: ParameterCalibration,
    pub family_pressure: FamilyPressureCalibration,
    pub aeis_thresholds_in_scope: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ParameterCalibration {
    pub implemented_default: f64,
    pub evidence: String,
    pub promotion_gate: String,
    #[serde(default)]
    pub aggregation: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FamilyPressureCalibration {
    pub production_aggregation: String,
    pub candidate_aggregation: String,
    pub evidence: String,
    pub promotion_gate: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ConditionSpec {
    pub id: NosologicalCondition,
    pub category: DiseaseCategory,
    pub markers: Vec<String>,
    pub therapies: Vec<String>,
    pub threshold: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TherapySpec {
    pub id: String,
    pub targets: Vec<String>,
    pub amount: f64,
    pub guards: Vec<Guard>,
    pub side_effects: Vec<SideEffect>,
    pub legacy: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Guard {
    pub marker: String,
    pub min: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SideEffect {
    pub marker: String,
    pub amount: f64,
}

pub fn catalog() -> &'static NosologyCatalog {
    static CATALOG: OnceLock<NosologyCatalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../../shared/nosology.json"))
            .expect("catalogue nosologique intégré invalide")
    })
}

pub fn therapy_spec(therapy: &SystemicTherapy) -> Option<&'static TherapySpec> {
    let encoded = serde_json::to_value(therapy).ok()?;
    let id = encoded.as_str()?;
    catalog().therapies.iter().find(|spec| spec.id == id)
}

pub fn condition_spec(condition: NosologicalCondition) -> &'static ConditionSpec {
    catalog()
        .conditions
        .iter()
        .find(|spec| spec.id == condition)
        .expect("condition absente du catalogue intégré")
}

pub fn normalized(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

/// Agrégation candidate `noisy_or_v2` : 1 - ∏(1 - p_i) sur les signaux normalisés.
/// Retourne 0.0 sur une liste vide, et borne le résultat à [0, 1].
pub fn family_pressure_noisy_or_v2(values: &[f64]) -> f64 {
    let mut complement = 1.0_f64;
    for &value in values {
        if normalized(value) {
            complement *= 1.0 - value;
        }
    }
    (1.0 - complement).clamp(0.0, 1.0)
}

/// Agrégation de référence `maximum_v1` : max des signaux normalisés, ou 0.0 si vide.
pub fn family_pressure_maximum_v1(values: &[f64]) -> f64 {
    values
        .iter()
        .copied()
        .filter(|&value| normalized(value))
        .fold(0.0_f64, f64::max)
        .clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_pressure_noisy_or_v2_empty_returns_zero() {
        assert_eq!(family_pressure_noisy_or_v2(&[]), 0.0);
    }

    #[test]
    fn family_pressure_noisy_or_v2_single_value() {
        assert!((family_pressure_noisy_or_v2(&[0.5]) - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn family_pressure_noisy_or_v2_multiple_values() {
        // 1 - (1-0.5)*(1-0.5) = 1 - 0.25 = 0.75
        assert!((family_pressure_noisy_or_v2(&[0.5, 0.5]) - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn family_pressure_noisy_or_v2_ignores_unnormalized() {
        assert!((family_pressure_noisy_or_v2(&[0.5, f64::NAN, 2.0, -1.0]) - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn family_pressure_noisy_or_v2_bounded_to_one() {
        let result = family_pressure_noisy_or_v2(&[1.0, 1.0, 0.9]);
        assert!((result - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn family_pressure_maximum_v1_empty_returns_zero() {
        assert_eq!(family_pressure_maximum_v1(&[]), 0.0);
    }

    #[test]
    fn family_pressure_maximum_v1_returns_max() {
        assert!((family_pressure_maximum_v1(&[0.2, 0.7, 0.3]) - 0.7).abs() < f64::EPSILON);
    }

    #[test]
    fn family_pressure_maximum_v1_ignores_unnormalized() {
        assert!((family_pressure_maximum_v1(&[0.2, f64::NAN, 0.7]) - 0.7).abs() < f64::EPSILON);
    }
}
