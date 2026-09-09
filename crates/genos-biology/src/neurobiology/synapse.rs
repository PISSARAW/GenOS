use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Synapse {
    pub target_id: String,
    pub weight: f64, // Plasticité : Force de la connexion.
    pub transmitter_type: Neurotransmitter,
    pub activity_history: u32, // Trace de l'utilisation récente
    
    // Neurobiologie de l'élagage (Pruning) et Plasticité
    pub ampa_receptors: f64,  // Densité (LTP)
    pub c3_opsonization: f64, // Signal "Eat Me" (Complément)
    pub cd47_expression: f64, // Signal "Don't Eat Me"
}

impl Synapse {
    pub fn new(target_id: String, weight: f64, transmitter_type: Neurotransmitter) -> Self {
        Self {
            target_id, weight, transmitter_type, activity_history: 0,
            ampa_receptors: 1.0, c3_opsonization: 0.0, cd47_expression: 1.0,
        }
    }
}
