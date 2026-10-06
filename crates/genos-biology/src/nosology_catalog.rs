use crate::therapy::SystemicTherapy;
use genos_cell::clinical::DiseaseCategory;
use genos_cell::nosology::NosologicalCondition;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct NosologyCatalog {
    pub schema: String,
    pub conditions: Vec<ConditionSpec>,
    pub therapies: Vec<TherapySpec>,
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
