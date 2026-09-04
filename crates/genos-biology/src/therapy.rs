use serde::{Deserialize, Serialize};

/// Les Thérapies Médicales pour soigner les agents cancéreux
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Therapy {
    TargetedTherapy,
    Immunotherapy,
    AntiAngiogenesis,
    CellCycleInhibitor,
}

/// Traitements administrés à l'ensemble du système
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SystemicTherapy {
    Tocilizumab,
    Corticosteroids(f64),
    IntensiveCareFluids,
    Antibiotic,
    Antiviral,
    Vaccine(String),
}
