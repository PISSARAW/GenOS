use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Soma {
    /// Le potentiel ÃƒÆ’Ã‚Â©lectrique actuel en millivolts (mV).
    pub current_potential: f64,
    /// Potentiel de repos, gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©ralement autour de -70 mV.
    pub resting_potential: f64,
    /// Le seuil d'excitation au CÃƒÆ’Ã‚Â´ne d'ÃƒÆ’Ã‚Â©mergence (Zone GÃƒÆ’Ã‚Â¢chette), gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©ralement -55 mV.
    pub threshold_potential: f64,
    /// Vitesse ÃƒÆ’Ã‚Â  laquelle le potentiel retombe au repos (fuite d'ions), gÃƒÆ’Ã‚Â¨re la sommation temporelle.
    pub potential_decay_rate: f64,
}

impl Soma {
    pub fn new() -> Self {
        Self {
            current_potential: -70.0,
            resting_potential: -70.0,
            threshold_potential: -55.0,
            potential_decay_rate: 2.0, // Retombe de 2mV par cycle d'inactivitÃƒÆ’Ã‚Â©
        }
    }

    /// Le CÃƒÆ’Ã‚Â´ne d'ÃƒÆ’Ã‚Â©mergence (Axon Hillock) ÃƒÆ’Ã‚Â©value la sommation spatiale et temporelle
    pub fn evaluate_axon_hillock(&mut self) -> bool {
        if self.current_potential >= self.threshold_potential {
            // LOI DU TOUT OU RIEN : La gÃƒÆ’Ã‚Â¢chette est pressÃƒÆ’Ã‚Â©e !
            // (En rÃƒÆ’Ã‚Â©alitÃƒÆ’Ã‚Â© ÃƒÆ’Ã‚Â§a monte ÃƒÆ’Ã‚Â  +40mV, puis ÃƒÆ’Ã‚Â§a chute). On rÃƒÆ’Ã‚Â©initialise pour la pÃƒÆ’Ã‚Â©riode rÃƒÆ’Ã‚Â©fractaire.
            self.current_potential = self.resting_potential;
            true
        } else {
            // Pas assez d'excitation. Le signal meurt ÃƒÆ’Ã‚Â  petit feu (Sommation Temporelle).
            if self.current_potential > self.resting_potential {
                self.current_potential -= self.potential_decay_rate;
                if self.current_potential < self.resting_potential {
                    self.current_potential = self.resting_potential;
                }
            } else if self.current_potential < self.resting_potential {
                // Si inhibÃƒÆ’Ã‚Â© (hyperpolarisation), remonte vers le repos
                self.current_potential += self.potential_decay_rate;
                if self.current_potential > self.resting_potential {
                    self.current_potential = self.resting_potential;
                }
            }
            false
        }
    }
}
