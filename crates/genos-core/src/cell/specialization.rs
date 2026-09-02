use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Specialization {
    Undefined,
    Neuron,
    Glial,
    Muscle,
    Adipocyte,
    Pluripotent,
    Custom(String),
}

impl Specialization {
    pub fn as_str(&self) -> &str {
        match self {
            Specialization::Undefined => "UNDEFINED",
            Specialization::Neuron => "NEURON",
            Specialization::Glial => "GLIAL",
            Specialization::Muscle => "MUSCLE",
            Specialization::Adipocyte => "ADIPOCYTE",
            Specialization::Pluripotent => "PLURIPOTENT",
            Specialization::Custom(s) => s.as_str(),
        }
    }
}