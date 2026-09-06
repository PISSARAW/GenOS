use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum SignalingMode {
    Juxtacrine,
    Paracrine,
    Endocrine,
    Autocrine,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Ligand {
    pub name: String,
    pub mode: SignalingMode,
    pub concentration: f64,
}

impl Ligand {
    pub fn new(name: &str, mode: SignalingMode, concentration: f64) -> Self {
        Self {
            name: name.to_string(),
            mode,
            concentration: if concentration.is_finite() {
                concentration.max(0.0)
            } else {
                0.0
            },
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Receptor {
    pub target_ligand: String,
    pub internal_cascade_signal: String,
    pub threshold: f64,
}

impl Receptor {
    pub fn new(target_ligand: &str, cascade_signal: &str, threshold: f64) -> Self {
        Self {
            target_ligand: target_ligand.to_string(),
            internal_cascade_signal: cascade_signal.to_string(),
            threshold,
        }
    }

    pub fn receive(&self, ligand: &Ligand) -> Option<&str> {
        if ligand.name == self.target_ligand
            && ligand.concentration.is_finite()
            && self.threshold.is_finite()
            && ligand.concentration >= self.threshold.max(0.0)
        {
            Some(&self.internal_cascade_signal)
        } else {
            None
        }
    }
}
