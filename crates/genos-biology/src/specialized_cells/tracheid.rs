use serde::{Deserialize, Serialize};

/// État du cycle de vie de la cellule trachéide
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TracheidState {
    /// Protoplaste vivant : phase exploratoire où l'agent modélise la tâche (coût token actif)
    LivingProtoplast,
    /// Apoptose et dépôt de lignine secondaire le long de la paroi
    ApoptoticLignification,
    /// Tube creux rigide et ossifié (le "bois" : débit maximal, 0 token de coût, déterministe)
    OssifiedConduit { static_pipeline_id: String },
}

/// Paroi secondaire lignifiée renforcée avec ponctuations aréolées
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LigninPorousPlate {
    pub lignification_grade: f64,       // [0.0 à 1.0]
    pub bordered_pits_count: usize,     // Ponctuations aréolées
    pub cavitation_resistance_mpa: f64, // Résistance à l'embolie gazeuse (-5.0 MPa)
}

impl Default for LigninPorousPlate {
    fn default() -> Self {
        Self {
            lignification_grade: 0.95,
            bordered_pits_count: 48,
            cavitation_resistance_mpa: -6.5,
        }
    }
}

/// Rapport de transition d'ossification post-apoptotique
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OssificationReport {
    pub tracheid_id: String,
    pub previous_state: String,
    pub new_state: String,
    pub static_conduit_id: String,
    pub token_cost_reduction_ratio: f64,
    pub hydraulic_throughput_multiplier: f64,
    pub status: String,
}

/// Résultat du transport de flux à haute pression/tension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SapTransportYield {
    pub transported_volume: f64,
    pub tension_applied_mpa: f64,
    pub cavitation_detected: bool,
    pub token_cost: f64,
    pub conduit_state: String,
}

/// Cellule Trachéide végétale pour l'ossification de code et de pipelines
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tracheid {
    pub id: String,
    pub state: TracheidState,
    pub plate: LigninPorousPlate,
    pub inner_diameter_um: f64,
}

impl Tracheid {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            state: TracheidState::LivingProtoplast,
            plate: LigninPorousPlate::default(),
            inner_diameter_um: 25.0,
        }
    }

    /// Déclenche l'apoptose structurante et l'ossification en conduit passif déterministe
    pub fn trigger_lignified_apoptosis(&mut self, pipeline_id: &str) -> Result<OssificationReport, String> {
        match self.state {
            TracheidState::OssifiedConduit { .. } => {
                Err("La trachéide est déjà entièrement ossifiée et vidée de son protoplaste.".to_string())
            }
            _ => {
                let prev = format!("{:?}", self.state);
                self.state = TracheidState::OssifiedConduit {
                    static_pipeline_id: pipeline_id.to_string(),
                };
                self.plate.lignification_grade = 1.0;

                Ok(OssificationReport {
                    tracheid_id: self.id.clone(),
                    previous_state: prev,
                    new_state: "OssifiedConduit".to_string(),
                    static_conduit_id: pipeline_id.to_string(),
                    token_cost_reduction_ratio: 1.0, // 100% de réduction (0 token)
                    hydraulic_throughput_multiplier: 50.0,
                    status: "APOPTOSIS_COMPLETE_LIGNIFIED_CONDUIT_FORMED".to_string(),
                })
            }
        }
    }

    /// Transporte le flux de données/sève à travers le conduit
    pub fn transport_sap_stream(&self, volume: f64, negative_tension_mpa: f64) -> Result<SapTransportYield, String> {
        let is_cavitated = negative_tension_mpa < self.plate.cavitation_resistance_mpa;

        match &self.state {
            TracheidState::LivingProtoplast => Ok(SapTransportYield {
                transported_volume: (volume * 0.2 * 100.0).round() / 100.0,
                tension_applied_mpa: negative_tension_mpa,
                cavitation_detected: false,
                token_cost: 15.0, // Coût token actif d'un agent vivant exploratoire
                conduit_state: "LIVING_PROTOPLAST_SLOW_THROUGHPUT".to_string(),
            }),
            TracheidState::ApoptoticLignification => Err("Trachéide en cours d'autolyse cellulaire.".to_string()),
            TracheidState::OssifiedConduit { static_pipeline_id } => {
                if is_cavitated {
                    Ok(SapTransportYield {
                        transported_volume: 0.0,
                        tension_applied_mpa: negative_tension_mpa,
                        cavitation_detected: true,
                        token_cost: 0.0,
                        conduit_state: "EMBOLISM_CAVITATION_BLOCK".to_string(),
                    })
                } else {
                    Ok(SapTransportYield {
                        transported_volume: volume,
                        tension_applied_mpa: negative_tension_mpa,
                        cavitation_detected: false,
                        token_cost: 0.0, // Conduit rigide : 0 token
                        conduit_state: format!("OSSIFIED_STATIC_PASS_THROUGH_{}", static_pipeline_id),
                    })
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracheid_lifecycle_and_ossification() {
        let mut tracheid = Tracheid::new("xylem_tracheid_1");
        assert_eq!(tracheid.state, TracheidState::LivingProtoplast);

        // Débit exploratoire avec coût token
        let initial_yield = tracheid.transport_sap_stream(100.0, -2.0).expect("Transport ok");
        assert_eq!(initial_yield.token_cost, 15.0);
        assert_eq!(initial_yield.transported_volume, 20.0);

        // Apoptose et ossification
        let report = tracheid.trigger_lignified_apoptosis("compiled_rust_pipeline_v1").expect("Ossification ok");
        assert_eq!(report.token_cost_reduction_ratio, 1.0);
        assert_eq!(report.status, "APOPTOSIS_COMPLETE_LIGNIFIED_CONDUIT_FORMED");

        // Transport à haute vitesse sans aucun coût de token
        let ossified_yield = tracheid.transport_sap_stream(100.0, -4.5).expect("High speed pass");
        assert_eq!(ossified_yield.token_cost, 0.0);
        assert_eq!(ossified_yield.transported_volume, 100.0);
        assert!(!ossified_yield.cavitation_detected);

        // Surtension extrême -> Cavitation
        let cavitated_yield = tracheid.transport_sap_stream(100.0, -9.0).expect("Cavitation pass");
        assert!(cavitated_yield.cavitation_detected);
        assert_eq!(cavitated_yield.transported_volume, 0.0);
    }
}
