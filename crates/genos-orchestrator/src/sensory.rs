//! Sens restants : navigation quantique, électro-réception, vision thermique.

use genos_biology::sensory::{
    ClusterN, DistortionAnalysis, IntentAlignmentReport, MormyroCerebellum,
    PassiveElectrosenseResult, TectumOpticum, TectumThermalMap,
};

/// Suite sensorielle avancée de l'orchestrateur.
pub struct SensorySuite {
    pub cluster_n: ClusterN,
    pub mormyro: MormyroCerebellum,
    pub tectum: TectumOpticum,
}

impl Default for SensorySuite {
    fn default() -> Self {
        Self::new()
    }
}

impl SensorySuite {
    pub fn new() -> Self {
        Self {
            cluster_n: ClusterN::new(0.5, 15.0),
            mormyro: MormyroCerebellum::new(500.0, 1.0, 0.1),
            tectum: TectumOpticum::new(0.05, 0.5, 0.7),
        }
    }

    /// Boussole cryptochrome : alignement d'un cap vers un objectif.
    pub fn navigate(&mut self, goal: &[f64], current: &[f64]) -> IntentAlignmentReport {
        self.cluster_n.compute_intent_heading(goal, current)
    }

    /// Électro-localisation active (décharge + analyse de distorsion).
    pub fn electrolocate(&mut self, impedance_samples: &[f64]) -> DistortionAnalysis {
        self.mormyro.discharge_and_analyze(impedance_samples)
    }

    /// Écoute électrique passive.
    pub fn passive_scan(&mut self, ambient_uv: &[f64]) -> PassiveElectrosenseResult {
        self.mormyro.passive_scan(ambient_uv)
    }

    /// Fusion multisensorielle vision + chaleur.
    pub fn fuse_thermal(
        &mut self,
        visual_nodes: &[(String, f64)],
        thermal_readings: &[(String, f64)],
    ) -> TectumThermalMap {
        self.tectum.fuse_modalities(visual_nodes, thermal_readings)
    }
}
