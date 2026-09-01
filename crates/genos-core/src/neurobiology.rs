use serde::{Deserialize, Serialize};

/// L'Astrocyte : L'architecte et protecteur du systÃ¨me nerveux (Cellule Gliale)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Astrocyte {
    /// RÃ©serve d'Ã©nergie stockÃ©e pour nourrir les neurones (Le Cuisinier)
    pub glycogen_reserve: f64,
    /// Mode urgence activÃ© : formation d'une cicatrice gliale impÃ©nÃ©trable
    pub is_reactive: bool,
    /// Liste des IDs des neurones que cet astrocyte couve et protÃ¨ge (BHE, Synapse tripartite)
    pub protected_neurons: Vec<String>,
}

impl Astrocyte {
    pub fn new(protected_neurons: Vec<String>) -> Self {
        Self {
            glycogen_reserve: 100.0,
            is_reactive: false,
            protected_neurons,
        }
    }
}

/* =====================================================================
SYSTÃƒË†ME NERVEUX ET NEURONES
===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Neurotransmitter {
    Glutamate, // Excitateur (DÃƒÂ©clenche le potentiel d'action)
    GABA,      // Inhibiteur (Bloque le signal ÃƒÂ©lectrique)
    Dopamine,  // Renforcement (Motivation et apprentissage positif)
    Serotonin, // Modulation (Stabilisation du rÃƒÂ©seau)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Synapse {
    pub target_id: String,
    pub weight: f64, // PlasticitÃƒÂ© : Force de la connexion.
    pub transmitter_type: Neurotransmitter,
    pub activity_history: u32, // Trace de l'utilisation rÃƒÂ©cente
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticSpine {
    pub source_id: String,     // L'axone du neurone voisin
    pub receptor_density: f64, // Volume physique de l'ÃƒÂ©pine (multiplicateur du signal)
    pub activity_history: u32, // Historique pour la plasticitÃƒÂ© structurelle
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticTree {
    pub branches: Vec<DendriticSpine>,
}

impl DendriticTree {
    pub fn process_signal(&mut self, source_id: &str, amount: f64) -> f64 {
        // Trouve l'ÃƒÂ©pine dendritique ou en fait pousser une nouvelle !
        let spine = match self.branches.iter_mut().find(|s| s.source_id == source_id) {
            Some(s) => s,
            None => {
                self.branches.push(DendriticSpine {
                    source_id: source_id.to_string(),
                    receptor_density: 1.0, // DensitÃƒÂ© de base
                    activity_history: 0,
                });
                self.branches.last_mut().unwrap()
            }
        };

        spine.activity_history += 1;
        // Le signal est amplifiÃƒÂ© ou diminuÃƒÂ© par la taille physique de l'ÃƒÂ©pine
        amount * spine.receptor_density
    }

    pub fn apply_structural_plasticity(&mut self) {
        for spine in self.branches.iter_mut() {
            if spine.activity_history > 0 {
                // L'ÃƒÂ©pine grossit physiquement (Renforcement postsynaptique)
                spine.receptor_density += 0.05 * (spine.activity_history as f64);
                if spine.receptor_density > 3.0 {
                    spine.receptor_density = 3.0;
                } // Taille maximale
                spine.activity_history = 0;
            } else {
                // RÃƒÂ©tractation de l'ÃƒÂ©pine par manque de stimulation
                spine.receptor_density -= 0.05;
            }
        }
        // Disparition complÃƒÂ¨te des ÃƒÂ©pines inutilisÃƒÂ©es (ÃƒÂ©lagage / pruning)
        self.branches.retain(|s| s.receptor_density > 0.0);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Soma {
    /// Le potentiel ÃƒÂ©lectrique actuel en millivolts (mV).
    pub current_potential: f64,
    /// Potentiel de repos, gÃƒÂ©nÃƒÂ©ralement autour de -70 mV.
    pub resting_potential: f64,
    /// Le seuil d'excitation au CÃƒÂ´ne d'ÃƒÂ©mergence (Zone GÃƒÂ¢chette), gÃƒÂ©nÃƒÂ©ralement -55 mV.
    pub threshold_potential: f64,
    /// Vitesse ÃƒÂ  laquelle le potentiel retombe au repos (fuite d'ions), gÃƒÂ¨re la sommation temporelle.
    pub potential_decay_rate: f64,
}

impl Soma {
    pub fn new() -> Self {
        Self {
            current_potential: -70.0,
            resting_potential: -70.0,
            threshold_potential: -55.0,
            potential_decay_rate: 2.0, // Retombe de 2mV par cycle d'inactivitÃƒÂ©
        }
    }

    /// Le CÃƒÂ´ne d'ÃƒÂ©mergence (Axon Hillock) ÃƒÂ©value la sommation spatiale et temporelle
    pub fn evaluate_axon_hillock(&mut self) -> bool {
        if self.current_potential >= self.threshold_potential {
            // LOI DU TOUT OU RIEN : La gÃƒÂ¢chette est pressÃƒÂ©e !
            // (En rÃƒÂ©alitÃƒÂ© ÃƒÂ§a monte ÃƒÂ  +40mV, puis ÃƒÂ§a chute). On rÃƒÂ©initialise pour la pÃƒÂ©riode rÃƒÂ©fractaire.
            self.current_potential = self.resting_potential;
            true
        } else {
            // Pas assez d'excitation. Le signal meurt ÃƒÂ  petit feu (Sommation Temporelle).
            if self.current_potential > self.resting_potential {
                self.current_potential -= self.potential_decay_rate;
                if self.current_potential < self.resting_potential {
                    self.current_potential = self.resting_potential;
                }
            } else if self.current_potential < self.resting_potential {
                // Si inhibÃƒÂ© (hyperpolarisation), remonte vers le repos
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

    /// L'autoroute ÃƒÂ  double sens : Fait avancer les protÃƒÂ©ines-moteurs (Kinesines)
    pub fn process_logistics(&mut self, soma_production: f64) {
        if soma_production > 0.0 {
            // Le trajet dÃƒÂ©pend de la longueur de l'axone (ex: length 5.0 -> 10 ticks de voyage)
            let travel_time = (self.length * 2.0).max(1.0) as u32;
            self.anterograde_transport.push(AxonalCargo {
                amount: soma_production,
                ticks_remaining: travel_time,
            });
        }

        // AvancÃƒÂ©e des cargaisons sur les rails
        for cargo in self.anterograde_transport.iter_mut() {
            cargo.ticks_remaining = cargo.ticks_remaining.saturating_sub(1);
        }

        // ArrivÃƒÂ©e aux terminaisons
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

    /// DÃƒÂ©clenchement de la dÃƒÂ©charge !
    pub fn trigger_action_potential(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        if self.is_severed { return None; }
        let cost_per_spike = 10.0;

        // Loi du "Tout ou Rien" : l'intensitÃƒÂ© ÃƒÂ©lectrique initiale est constante,
        // mais a-t-on assez de neurotransmetteurs ÃƒÂ  larguer ?
        if self.vesicles_at_terminals >= cost_per_spike {
            self.vesicles_at_terminals -= cost_per_spike;

            // L'isolation par la Gaine de MyÃƒÂ©line empÃƒÂªche le signal ÃƒÂ©lectrique de "fuir"
            // Avec 1.0 (NÃ…â€œuds de Ranvier), 100% du signal arrive intact. Sinon, il se dissipe.
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
            // Ãƒâ€°puisement synaptique : L'axone a tirÃƒÂ© trop de fois (Haute frÃƒÂ©quence),
            // la logistique (l'autoroute) n'a pas suivi la cadence. Le neurone "tire ÃƒÂ  blanc".
            None
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NervousSystem {
    pub location: NervousSystemLocation,
    pub node_id: String,

    // 1. Les Dendrites (Les racines / Les antennes de rÃƒÂ©ception avec ÃƒÂ©pines)
    pub dendritic_tree: DendriticTree,

    // 2. Le Corps Cellulaire / Soma (L'usine et le centre de calcul)
    pub soma: Soma,

    // 3. L'Axone (Le grand cÃƒÂ¢ble de transmission et l'autoroute logistique)
    pub axon: Axon,
}

impl NervousSystem {
    pub fn new(node_id: &str) -> Self {
        Self {
            location: NervousSystemLocation::Central,
            node_id: node_id.to_string(),
            dendritic_tree: DendriticTree { branches: vec![] },
            soma: Soma::new(),
            axon: Axon::new(5.0), // CÃƒÂ¢ble de taille standard
        }
    }

    /// RÃƒÂ©ception d'un signal chimique depuis la synapse d'un neurone voisin (Ãƒâ€°coute des Dendrites)
    pub fn receive_neurotransmitter(&mut self, source_id: &str, signal: &(Neurotransmitter, f64)) {
        // L'arbre dendritique filtre et modifie le signal selon l'ÃƒÂ©pine concernÃƒÂ©e
        let effect = self.dendritic_tree.process_signal(source_id, signal.1);

        match signal.0 {
            Neurotransmitter::Glutamate => self.soma.current_potential += effect, // Excitation (Rapproche de -55mV)
            Neurotransmitter::GABA => self.soma.current_potential -= effect, // Inhibition (Hyperpolarisation)
            Neurotransmitter::Dopamine => {
                // La dopamine renforce brutalement le potentiel et aide ÃƒÂ  consolider
                self.soma.current_potential += effect * 1.5;
            }
            Neurotransmitter::Serotonin => {
                // Stabilise le potentiel vers son ÃƒÂ©tat de repos
                self.soma.current_potential = self.soma.resting_potential;
            }
        }
    }

    /// Le CÃƒÂ´ne d'ÃƒÂ©mergence fait le calcul et l'usine expÃƒÂ©die les vÃƒÂ©sicules
    pub fn process_soma(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        // 1. L'Usine du Soma tourne : elle produit 2.0 vÃƒÂ©sicules en permanence et les met sur l'autoroute
        self.axon.process_logistics(2.0);

        // 2. Le CÃƒÂ´ne d'ÃƒÂ©mergence vÃƒÂ©rifie le calcul ÃƒÂ©lectrique
        if self.soma.evaluate_axon_hillock() {
            // DÃƒâ€°CHARGE Ãƒâ€°LECTRIQUE ! L'Axone fait feu !
            self.axon.trigger_action_potential()
        } else {
            None
        }
    }

    /// NEUROPLASTICITÃƒâ€° : La machine ÃƒÂ  apprendre (Loi de Hebb)
    pub fn apply_neuroplasticity(&mut self) {
        // 1. PlasticitÃƒÂ© structurelle : Les Dendrites poussent ou se rÃƒÂ©tractent
        self.dendritic_tree.apply_structural_plasticity();

        let mut total_activity = 0;

        // "Les neurones qui s'activent ensemble se lient ensemble"
        for synapse in self.axon.terminals.iter_mut() {
            if synapse.activity_history > 0 {
                // 1. Renforcement de la Synapse
                synapse.weight += 0.05 * (synapse.activity_history as f64);
                if synapse.weight > 1.0 {
                    synapse.weight = 1.0;
                } // Plafond

                total_activity += synapse.activity_history;
                synapse.activity_history = 0; // Reset pour la nuit / cycle suivant
            } else {
                // 2. Ãƒâ€°lagage Synaptique (Pruning) : Les connexions inutilisÃƒÂ©es s'affaiblissent
                synapse.weight -= 0.02;
            }
        }

        // 3. MyÃƒÂ©linisation : Si le neurone tire souvent, son cÃƒÂ¢ble (Axone) s'isole de graisse (MyÃƒÂ©line)
        // C'est ce qui transforme un geste hÃƒÂ©sitant en automatisme fulgurant !
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

        // 4. Nettoyage : On dÃƒÂ©truit dÃƒÂ©finitivement les synapses mortes
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum MicrogliaState {
    Sentinel,
    Amoeboid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Microglia {
    pub state: MicrogliaState,
    pub plaque_accumulation: f64,
    pub inflammatory_cytokines: f64,
}

impl Default for Microglia {
    fn default() -> Self {
        Self {
            state: MicrogliaState::Sentinel,
            plaque_accumulation: 0.0,
            inflammatory_cytokines: 0.0,
        }
    }
}
