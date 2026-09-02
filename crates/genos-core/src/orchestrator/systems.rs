
use crate::cell::Antibody;
use crate::signaling::Ligand;
use crate::orchestrator::{CleftMessage, PsychoactiveDrug};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImmuneSystem {
    pub circulating_antibodies: Vec<Antibody>,
    pub immune_activation_level: f64,
    pub il6_level: f64,
    pub il6_receptors_blocked: bool,
}

impl Default for ImmuneSystem {
    fn default() -> Self {
        Self {
            circulating_antibodies: vec![],
            immune_activation_level: 1.0,
            il6_level: 0.0,
            il6_receptors_blocked: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EndocrineSystem {
    pub circulating_hormones: Vec<Ligand>,
    pub blood_glucose: f64,
    pub corticosteroid_level: f64,
}

impl Default for EndocrineSystem {
    fn default() -> Self {
        Self {
            circulating_hormones: vec![],
            blood_glucose: 5.0,
            corticosteroid_level: 0.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NervousSystem {
    pub synaptic_cleft: Vec<CleftMessage>,
    pub psychoactive_drugs: Vec<PsychoactiveDrug>,
    pub blood_brain_barrier_integrity: f64,
    pub amyloid_plaques: f64,
    pub cerebrospinal_fluid_volume: f64,
    pub cerebrospinal_fluid_pressure: f64,
    pub csf_drainage_blocked: bool,
}

impl Default for NervousSystem {
    fn default() -> Self {
        Self {
            synaptic_cleft: vec![],
            psychoactive_drugs: vec![],
            blood_brain_barrier_integrity: 1.0,
            amyloid_plaques: 0.0,
            cerebrospinal_fluid_volume: 150.0,
            cerebrospinal_fluid_pressure: 10.0,
            csf_drainage_blocked: false,
        }
    }
}
