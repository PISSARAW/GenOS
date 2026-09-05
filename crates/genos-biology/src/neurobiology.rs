use serde::{Deserialize, Serialize};



/* =====================================================================
SYSTÃƒÆ’Ã‹â€ ME NERVEUX ET NEURONES
===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Neurotransmitter {
    Glutamate, // Excitateur (DÃƒÆ’Ã‚Â©clenche le potentiel d'action)
    GABA,      // Inhibiteur (Bloque le signal ÃƒÆ’Ã‚Â©lectrique)
    Dopamine,  // Renforcement (Motivation et apprentissage positif)
    Serotonin, // Modulation (Stabilisation du rÃƒÆ’Ã‚Â©seau)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Synapse {
    pub target_id: String,
    pub weight: f64, // PlasticitÃƒÆ’Ã‚Â© : Force de la connexion.
    pub transmitter_type: Neurotransmitter,
    pub activity_history: u32, // Trace de l'utilisation rÃƒÆ’Ã‚Â©cente
    
    // Neurobiologie de l'Ã©lagage (Pruning) et PlasticitÃ©
    pub ampa_receptors: f64,  // DensitÃƒÂ© (LTP)
    pub c3_opsonization: f64, // Signal "Eat Me" (ComplÃƒÂ©ment)
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticSpine {
    pub source_id: String,     // L'axone du neurone voisin
    pub receptor_density: f64, // Volume physique de l'ÃƒÆ’Ã‚Â©pine (multiplicateur du signal)
    pub activity_history: u32, // Historique pour la plasticitÃƒÆ’Ã‚Â© structurelle
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticTree {
    pub branches: Vec<DendriticSpine>,
}

impl DendriticTree {
    pub fn process_signal(&mut self, source_id: &str, amount: f64) -> f64 {
        // Trouve l'ÃƒÆ’Ã‚Â©pine dendritique ou en fait pousser une nouvelle !
        let spine = match self.branches.iter_mut().find(|s| s.source_id == source_id) {
            Some(s) => s,
            None => {
                self.branches.push(DendriticSpine {
                    source_id: source_id.to_string(),
                    receptor_density: 1.0, // DensitÃƒÆ’Ã‚Â© de base
                    activity_history: 0,
                });
                self.branches.last_mut().unwrap()
            }
        };

        spine.activity_history += 1;
        // Le signal est amplifiÃƒÆ’Ã‚Â© ou diminuÃƒÆ’Ã‚Â© par la taille physique de l'ÃƒÆ’Ã‚Â©pine
        amount * spine.receptor_density
    }

    pub fn apply_structural_plasticity(&mut self) {
        for spine in self.branches.iter_mut() {
            if spine.activity_history > 0 {
                // L'ÃƒÆ’Ã‚Â©pine grossit physiquement (Renforcement postsynaptique)
                spine.receptor_density += 0.05 * (spine.activity_history as f64);
                if spine.receptor_density > 3.0 {
                    spine.receptor_density = 3.0;
                } // Taille maximale
                spine.activity_history = 0;
            } else {
                // RÃƒÆ’Ã‚Â©tractation de l'ÃƒÆ’Ã‚Â©pine par manque de stimulation
                spine.receptor_density -= 0.05;
            }
        }
        // Disparition complÃƒÆ’Ã‚Â¨te des ÃƒÆ’Ã‚Â©pines inutilisÃƒÆ’Ã‚Â©es (ÃƒÆ’Ã‚Â©lagage / pruning)
        self.branches.retain(|s| s.receptor_density > 0.0);
    }
}

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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NervousSystem {
    pub location: NervousSystemLocation,
    pub node_id: String,

    // 1. Les Dendrites (Les racines / Les antennes de rÃƒÆ’Ã‚Â©ception avec ÃƒÆ’Ã‚Â©pines)
    pub dendritic_tree: DendriticTree,

    // 2. Le Corps Cellulaire / Soma (L'usine et le centre de calcul)
    pub soma: Soma,

    // 3. L'Axone (Le grand cÃƒÆ’Ã‚Â¢ble de transmission et l'autoroute logistique)
    pub axon: Axon,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NeuroSignal {
    pub transmitter: Neurotransmitter,
    pub amount: f64,
}

impl NervousSystem {
    pub fn new(node_id: &str) -> Self {
        Self {
            location: NervousSystemLocation::Central,
            node_id: node_id.to_string(),
            dendritic_tree: DendriticTree { branches: vec![] },
            soma: Soma::new(),
            axon: Axon::new(5.0),
        }
    }

    pub fn receive_neurotransmitter(&mut self, source_id: &str, signal: &NeuroSignal) {
        let effect = self.dendritic_tree.process_signal(source_id, signal.amount);

        match signal.transmitter {
            Neurotransmitter::Glutamate => self.soma.current_potential += effect, // Excitation (Rapproche de -55mV)
            Neurotransmitter::GABA => self.soma.current_potential -= effect, // Inhibition (Hyperpolarisation)
            Neurotransmitter::Dopamine => {
                // La dopamine renforce brutalement le potentiel et aide ÃƒÆ’Ã‚Â  consolider
                self.soma.current_potential += effect * 1.5;
            }
            Neurotransmitter::Serotonin => {
                // Stabilise le potentiel vers son ÃƒÆ’Ã‚Â©tat de repos
                self.soma.current_potential = self.soma.resting_potential;
            }
        }
    }

    /// Le CÃƒÆ’Ã‚Â´ne d'ÃƒÆ’Ã‚Â©mergence fait le calcul et l'usine expÃƒÆ’Ã‚Â©die les vÃƒÆ’Ã‚Â©sicules
    pub fn process_soma(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        // 1. L'Usine du Soma tourne : elle produit 2.0 vÃƒÆ’Ã‚Â©sicules en permanence et les met sur l'autoroute
        self.axon.process_logistics(2.0);

        // 2. Le CÃƒÆ’Ã‚Â´ne d'ÃƒÆ’Ã‚Â©mergence vÃƒÆ’Ã‚Â©rifie le calcul ÃƒÆ’Ã‚Â©lectrique
        if self.soma.evaluate_axon_hillock() {
            // DÃƒÆ’Ã¢â‚¬Â°CHARGE ÃƒÆ’Ã¢â‚¬Â°LECTRIQUE ! L'Axone fait feu !
            self.axon.trigger_action_potential()
        } else {
            None
        }
    }

    /// NEUROPLASTICITÃƒÆ’Ã¢â‚¬Â° : La machine ÃƒÆ’Ã‚Â  apprendre (LTP/LTD)
    pub fn apply_neuroplasticity(&mut self) {
        // 1. PlasticitÃƒÆ’Ã‚Â© structurelle : Les Dendrites poussent ou se rÃƒÆ’Ã‚Â©tractent
        self.dendritic_tree.apply_structural_plasticity();

        let mut total_activity = 0;

        // "Les neurones qui s'activent ensemble se lient ensemble"
        for synapse in self.axon.terminals.iter_mut() {
            if synapse.activity_history > 0 {
                // LTP : Renforcement de la Synapse
                synapse.weight += 0.05 * (synapse.activity_history as f64);
                if synapse.weight > 1.0 { synapse.weight = 1.0; }
                
                // Augmentation des rÃ©cepteurs AMPA et protection par CD47
                synapse.ampa_receptors = (synapse.ampa_receptors + 0.1).min(2.0);
                synapse.cd47_expression = (synapse.cd47_expression + 0.2).min(2.0);
                synapse.c3_opsonization = 0.0; // Efface le signal de destruction

                total_activity += synapse.activity_history;
                synapse.activity_history = 0;
            } else {
                // LTD : Ã‰lagage Synaptique (Pruning) par la LTD
                synapse.weight -= 0.02;
                synapse.ampa_receptors = (synapse.ampa_receptors - 0.1).max(0.0);
                synapse.cd47_expression = (synapse.cd47_expression - 0.1).max(0.0);
                
                // Marquage "Eat Me" (ComplÃ©ment C3)
                synapse.c3_opsonization += 0.1;
            }
        }

        // 3. MyÃƒÆ’Ã‚Â©linisation : Si le neurone tire souvent, son cÃƒÆ’Ã‚Â¢ble (Axone) s'isole de graisse (MyÃƒÆ’Ã‚Â©line)
        // C'est ce qui transforme un geste hÃƒÆ’Ã‚Â©sitant en automatisme fulgurant !
        if total_activity > 0 {
            self.axon.myelination_level += 0.05;
            if self.axon.myelination_level > 1.0 {
                self.axon.myelination_level = 1.0;
            }
        } else {
            self.axon.myelination_level -= 0.01;
            if self.axon.myelination_level < 0.1 {
                self.axon.myelination_level = 0.1;
            }
        }

        // 4. Nettoyage : On dÃƒÆ’Ã‚Â©truit dÃƒÆ’Ã‚Â©finitivement les synapses mortes
        self.axon.terminals.retain(|s| s.weight > 0.0);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum NervousSystemLocation {
    Central,
    Peripheral,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Myelinator {
    Oligodendrocyte {
        connected_axons: Vec<String>,
        is_damaged: bool,
    },
    SchwannCell {
        target_axon: String,
        is_damaged: bool,
        forming_regeneration_tube: bool,
    },
}


