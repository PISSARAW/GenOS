use crate::clinical::DiseaseCategory;
use serde::{Deserialize, Serialize};

/// Identifiants des 28 conditions simulées, sans diagnostic médical humain.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[repr(usize)]
pub enum NosologicalCondition {
    Lupus,
    RheumatoidArthritis,
    MultipleSclerosis,
    Type1Diabetes,
    Alzheimer,
    Parkinson,
    Osteoarthritis,
    Influenza,
    Tuberculosis,
    Malaria,
    HivInfection,
    SickleCellDisease,
    CysticFibrosis,
    DuchenneMuscularDystrophy,
    LungCancer,
    Leukemia,
    Melanoma,
    Type2Diabetes,
    Hypothyroidism,
    Gout,
    Hypertension,
    MyocardialInfarction,
    IschemicStroke,
    MajorDepression,
    Schizophrenia,
    BipolarDisorder,
    Asbestosis,
    LeadPoisoning,
}

const LABELS: [(&str, DiseaseCategory); 28] = [
    ("Lupus computationnel", DiseaseCategory::Autoimmune),
    (
        "RheumatoidArthritis computationnel",
        DiseaseCategory::Autoimmune,
    ),
    (
        "MultipleSclerosis computationnel",
        DiseaseCategory::Autoimmune,
    ),
    ("Type1Diabetes computationnel", DiseaseCategory::Autoimmune),
    ("Alzheimer computationnel", DiseaseCategory::Degenerative),
    ("Parkinson computationnel", DiseaseCategory::Degenerative),
    (
        "Osteoarthritis computationnel",
        DiseaseCategory::Degenerative,
    ),
    ("Influenza computationnel", DiseaseCategory::Infectious),
    ("Tuberculosis computationnel", DiseaseCategory::Infectious),
    ("Malaria computationnel", DiseaseCategory::Infectious),
    ("HivInfection computationnel", DiseaseCategory::Infectious),
    ("SickleCellDisease computationnel", DiseaseCategory::Genetic),
    ("CysticFibrosis computationnel", DiseaseCategory::Genetic),
    (
        "DuchenneMuscularDystrophy computationnel",
        DiseaseCategory::Genetic,
    ),
    ("LungCancer computationnel", DiseaseCategory::Cancer),
    ("Leukemia computationnel", DiseaseCategory::Cancer),
    ("Melanoma computationnel", DiseaseCategory::Cancer),
    ("Type2Diabetes computationnel", DiseaseCategory::Metabolic),
    ("Hypothyroidism computationnel", DiseaseCategory::Metabolic),
    ("Gout computationnel", DiseaseCategory::Metabolic),
    (
        "Hypertension computationnel",
        DiseaseCategory::Cardiovascular,
    ),
    (
        "MyocardialInfarction computationnel",
        DiseaseCategory::Cardiovascular,
    ),
    (
        "IschemicStroke computationnel",
        DiseaseCategory::Cardiovascular,
    ),
    (
        "MajorDepression computationnel",
        DiseaseCategory::Psychiatric,
    ),
    ("Schizophrenia computationnel", DiseaseCategory::Psychiatric),
    (
        "BipolarDisorder computationnel",
        DiseaseCategory::Psychiatric,
    ),
    ("Asbestosis computationnel", DiseaseCategory::Environmental),
    (
        "LeadPoisoning computationnel",
        DiseaseCategory::Environmental,
    ),
];

impl NosologicalCondition {
    pub fn name(self) -> &'static str {
        LABELS[self as usize].0
    }
    pub fn category(self) -> DiseaseCategory {
        LABELS[self as usize].1.clone()
    }
}

impl crate::clinical::Pathology {
    pub fn same_diagnosis(&self, other: &Self) -> bool {
        use crate::clinical::Pathology;
        match (self, other) {
            (
                Pathology::Nosological { condition: a, .. },
                Pathology::Nosological { condition: b, .. },
            ) => a == b,
            (
                Pathology::TherapyAdverseEffect {
                    therapy: a,
                    marker: m,
                    ..
                },
                Pathology::TherapyAdverseEffect {
                    therapy: b,
                    marker: n,
                    ..
                },
            ) => a == b && m == n,
            (
                Pathology::CrossContamination {
                    pathogen_signature: a,
                    ..
                },
                Pathology::CrossContamination {
                    pathogen_signature: b,
                    ..
                },
            ) => a == b,
            (
                Pathology::ViralInfection {
                    pathogen_signature: a,
                },
                Pathology::ViralInfection {
                    pathogen_signature: b,
                },
            ) => a == b,
            (
                Pathology::HospitalAcquiredInfection { origin_facility: a },
                Pathology::HospitalAcquiredInfection { origin_facility: b },
            ) => a == b,
            (
                Pathology::AutologousTargeting {
                    targeted_agent_role: a,
                },
                Pathology::AutologousTargeting {
                    targeted_agent_role: b,
                },
            ) => a == b,
            _ => self.name() == other.name(),
        }
    }
}
