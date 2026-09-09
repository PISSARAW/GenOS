use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AxonalCargo {
    pub amount: f64,
    pub ticks_remaining: u32,
}


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Axon {
    pub length: f64,
    pub myelination_level: f64,
    pub vesicles_at_terminals: f64,
    pub anterograde_transport: Vec<AxonalCargo>,
    pub terminals: Vec<Synapse>,
    pub is_severed: bool,
    pub nogo_inhibited: bool,
}

impl Axon {
    pub fn new(length: f64) -> Self {
        Self {
            length,
            myelination_level: 0.2,
            vesicles_at_terminals: 50.0, // Munitions initiales
            anterograde_transport: vec![],
            terminals: vec![],
            is_severed: false,
            nogo_inhibited: false,
        }
    }

    /// L'autoroute ÃƒÆ’Ã‚Â  double sens : Fait avancer les protÃƒÆ’Ã‚Â©ines-moteurs (Kinesines)
    pub fn process_logistics(&mut self, soma_production: f64) {
        if soma_production > 0.0 {
            // Le trajet dÃƒÆ’Ã‚Â©pend de la longueur de l'axone (ex: length 5.0 -> 10 ticks de voyage)
            let travel_time = (self.length * 2.0).max(1.0) as u32;
            self.anterograde_transport.push(AxonalCargo {
                amount: soma_production,
                ticks_remaining: travel_time,
            });
        }

        // AvancÃƒÆ’Ã‚Â©e des cargaisons sur les rails
        for cargo in self.anterograde_transport.iter_mut() {
            cargo.ticks_remaining = cargo.ticks_remaining.saturating_sub(1);
        }

        // ArrivÃƒÆ’Ã‚Â©e aux terminaisons
        let mut arrived = 0.0;
        self.anterograde_transport.retain(|c| {
            if c.ticks_remaining == 0 {
                arrived += c.amount;
                false
            } else {
                true
            }
        });
        self.vesicles_at_terminals += arrived;
    }

    /// DÃƒÆ’Ã‚Â©clenchement de la dÃƒÆ’Ã‚Â©charge !
    pub fn trigger_action_potential(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        if self.is_severed { return None; }
        let cost_per_spike = 10.0;

        // Loi du "Tout ou Rien" : l'intensitÃƒÆ’Ã‚Â© ÃƒÆ’Ã‚Â©lectrique initiale est constante,
        // mais a-t-on assez de neurotransmetteurs ÃƒÆ’Ã‚Â  larguer ?
        if self.vesicles_at_terminals >= cost_per_spike {
            self.vesicles_at_terminals -= cost_per_spike;

            // L'isolation par la Gaine de MyÃƒÆ’Ã‚Â©line empÃƒÆ’Ã‚Âªche le signal ÃƒÆ’Ã‚Â©lectrique de "fuir"
            // Avec 1.0 (NÃƒâ€¦Ã¢â‚¬Å“uds de Ranvier), 100% du signal arrive intact. Sinon, il se dissipe.
            let conduction_efficiency = 0.2 + (0.8 * self.myelination_level);
            let delivered_signal = 20.0 * conduction_efficiency;

            let mut outputs = vec![];
            for synapse in self.terminals.iter_mut() {
                let released_amount = delivered_signal * synapse.weight;
                outputs.push((
                    synapse.target_id.clone(),
                    synapse.transmitter_type.clone(),
                    released_amount,
                ));
                synapse.activity_history += 1;
            }
            Some(outputs)
        } else {
            // ÃƒÆ’Ã¢â‚¬Â°puisement synaptique : L'axone a tirÃƒÆ’Ã‚Â© trop de fois (Haute frÃƒÆ’Ã‚Â©quence),
            // la logistique (l'autoroute) n'a pas suivi la cadence. Le neurone "tire ÃƒÆ’Ã‚Â  blanc".
            None
        }
    }
}
