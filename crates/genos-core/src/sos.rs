use serde::{Deserialize, Serialize};
use crate::genome::AgentGenome;

/// Modélise la réponse globale à un stress environnemental extrême.
/// Lorsque le seuil de stress est franchi, cela active une polymérase propice aux erreurs
/// pour accélérer l'exploration de mutations salvatrices.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SosResponse {
    pub stress_threshold: f32,
    pub error_prone_polymerase_active: bool,
    pub mutation_rate_multiplier: f32,
}

/// Trait définissant la capacité d'un agent à muter de façon adaptative sous contrainte.
pub trait AdaptiveMutation {
    /// Applique les effets physiologiques et génétiques du stress SOS sur le génome de l'agent.
    fn apply_sos_stress(&mut self, sos_response: &SosResponse);
}

impl AdaptiveMutation for AgentGenome {
    fn apply_sos_stress(&mut self, sos_response: &SosResponse) {
        if sos_response.error_prone_polymerase_active {
            let claim_name = format!("SOS_ACTIVE_MUT_x{}", sos_response.mutation_rate_multiplier);
            self.infer_trait_claim(&[], &claim_name);
        }
    }
}
