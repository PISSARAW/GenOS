use serde::{Deserialize, Serialize};

/// L'Astrocyte : L'architecte et protecteur du système nerveux (Cellule Gliale)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Astrocyte {
    /// Réserve d'énergie stockée pour nourrir les neurones (Le Cuisinier)
    pub glycogen_reserve: f64,
    /// Mode urgence activé : formation d'une cicatrice gliale impénétrable
    pub is_reactive: bool,
    /// Liste des IDs des neurones que cet astrocyte couve et protège (BHE, Synapse tripartite)
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
SYSTÃˆME NERVEUX ET NEURONES
===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Neurotransmitter {
    Glutamate, // Excitateur (DÃ©clenche le potentiel d'action)
    GABA,      // Inhibiteur (Bloque le signal Ã©lectrique)
    Dopamine,  // Renforcement (Motivation et apprentissage positif)
    Serotonin, // Modulation (Stabilisation du rÃ©seau)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Synapse {
    pub target_id: String,
    pub weight: f64, // PlasticitÃ© : Force de la connexion.
    pub transmitter_type: Neurotransmitter,
    pub activity_history: u32, // Trace de l'utilisation rÃ©cente
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticSpine {
    pub source_id: String,     // L'axone du neurone voisin
    pub receptor_density: f64, // Volume physique de l'Ã©pine (multiplicateur du signal)
    pub activity_history: u32, // Historique pour la plasticitÃ© structurelle
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticTree {
    pub branches: Vec<DendriticSpine>,
}

impl DendriticTree {
    pub fn process_signal(&mut self, source_id: &str, amount: f64) -> f64 {
        // Trouve l'Ã©pine dendritique ou en fait pousser une nouvelle !
        let spine = match self.branches.iter_mut().find(|s| s.source_id == source_id) {
            Some(s) => s,
            None => {
                self.branches.push(DendriticSpine {
                    source_id: source_id.to_string(),
                    receptor_density: 1.0, // DensitÃ© de base
                    activity_history: 0,
                });
                self.branches.last_mut().unwrap()
            }
        };

        spine.activity_history += 1;
        // Le signal est amplifiÃ© ou diminuÃ© par la taille physique de l'Ã©pine
        amount * spine.receptor_density
    }

    pub fn apply_structural_plasticity(&mut self) {
        for spine in self.branches.iter_mut() {
            if spine.activity_history > 0 {
                // L'Ã©pine grossit physiquement (Renforcement postsynaptique)
                spine.receptor_density += 0.05 * (spine.activity_history as f64);
                if spine.receptor_density > 3.0 {
                    spine.receptor_density = 3.0;
                } // Taille maximale
                spine.activity_history = 0;
            } else {
                // RÃ©tractation de l'Ã©pine par manque de stimulation
                spine.receptor_density -= 0.05;
            }
        }
        // Disparition complÃ¨te des Ã©pines inutilisÃ©es (Ã©lagage / pruning)
        self.branches.retain(|s| s.receptor_density > 0.0);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Soma {
    /// Le potentiel Ã©lectrique actuel en millivolts (mV).
    pub current_potential: f64,
    /// Potentiel de repos, gÃ©nÃ©ralement autour de -70 mV.
    pub resting_potential: f64,
    /// Le seuil d'excitation au CÃ´ne d'Ã©mergence (Zone GÃ¢chette), gÃ©nÃ©ralement -55 mV.
    pub threshold_potential: f64,
    /// Vitesse Ã  laquelle le potentiel retombe au repos (fuite d'ions), gÃ¨re la sommation temporelle.
    pub potential_decay_rate: f64,
}

impl Soma {
    pub fn new() -> Self {
        Self {
            current_potential: -70.0,
            resting_potential: -70.0,
            threshold_potential: -55.0,
            potential_decay_rate: 2.0, // Retombe de 2mV par cycle d'inactivitÃ©
        }
    }

    /// Le CÃ´ne d'Ã©mergence (Axon Hillock) Ã©value la sommation spatiale et temporelle
    pub fn evaluate_axon_hillock(&mut self) -> bool {
        if self.current_potential >= self.threshold_potential {
            // LOI DU TOUT OU RIEN : La gÃ¢chette est pressÃ©e !
            // (En rÃ©alitÃ© Ã§a monte Ã  +40mV, puis Ã§a chute). On rÃ©initialise pour la pÃ©riode rÃ©fractaire.
            self.current_potential = self.resting_potential;
            true
        } else {
            // Pas assez d'excitation. Le signal meurt Ã  petit feu (Sommation Temporelle).
            if self.current_potential > self.resting_potential {
                self.current_potential -= self.potential_decay_rate;
                if self.current_potential < self.resting_potential {
                    self.current_potential = self.resting_potential;
                }
            } else if self.current_potential < self.resting_potential {
                // Si inhibÃ© (hyperpolarisation), remonte vers le repos
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
    /// Longueur du cÃ¢ble (dÃ©termine le temps de trajet logistique)
    pub length: f64,
    /// Gaine de myÃ©line (0.0 = Conduction lente avec fuites, 1.0 = Conduction saltatoire ultra-rapide sans perte)
    pub myelination_level: f64,
    /// Stock de neurotransmetteurs aux terminaisons, prÃªt Ã  Ãªtre larguÃ©
    pub vesicles_at_terminals: f64,
    /// L'autoroute logistique : Transport de vÃ©sicules sur les microtubules
    pub anterograde_transport: Vec<AxonalCargo>,
    /// Les ramifications terminales (Synapses)
    pub terminals: Vec<Synapse>,
}

impl Axon {
    pub fn new(length: f64) -> Self {
        Self {
            length,
            myelination_level: 0.2,
            vesicles_at_terminals: 50.0, // Munitions initiales
            anterograde_transport: vec![],
            terminals: vec![],
        }
    }

    /// L'autoroute Ã  double sens : Fait avancer les protÃ©ines-moteurs (Kinesines)
    pub fn process_logistics(&mut self, soma_production: f64) {
        if soma_production > 0.0 {
            // Le trajet dÃ©pend de la longueur de l'axone (ex: length 5.0 -> 10 ticks de voyage)
            let travel_time = (self.length * 2.0).max(1.0) as u32;
            self.anterograde_transport.push(AxonalCargo {
                amount: soma_production,
                ticks_remaining: travel_time,
            });
        }

        // AvancÃ©e des cargaisons sur les rails
        for cargo in self.anterograde_transport.iter_mut() {
            cargo.ticks_remaining = cargo.ticks_remaining.saturating_sub(1);
        }

        // ArrivÃ©e aux terminaisons
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

    /// DÃ©clenchement de la dÃ©charge !
    pub fn trigger_action_potential(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        let cost_per_spike = 10.0;

        // Loi du "Tout ou Rien" : l'intensitÃ© Ã©lectrique initiale est constante,
        // mais a-t-on assez de neurotransmetteurs Ã  larguer ?
        if self.vesicles_at_terminals >= cost_per_spike {
            self.vesicles_at_terminals -= cost_per_spike;

            // L'isolation par la Gaine de MyÃ©line empÃªche le signal Ã©lectrique de "fuir"
            // Avec 1.0 (NÅ“uds de Ranvier), 100% du signal arrive intact. Sinon, il se dissipe.
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
            // Ã‰puisement synaptique : L'axone a tirÃ© trop de fois (Haute frÃ©quence),
            // la logistique (l'autoroute) n'a pas suivi la cadence. Le neurone "tire Ã  blanc".
            None
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NervousSystem {
    pub node_id: String,

    // 1. Les Dendrites (Les racines / Les antennes de rÃ©ception avec Ã©pines)
    pub dendritic_tree: DendriticTree,

    // 2. Le Corps Cellulaire / Soma (L'usine et le centre de calcul)
    pub soma: Soma,

    // 3. L'Axone (Le grand cÃ¢ble de transmission et l'autoroute logistique)
    pub axon: Axon,
}

impl NervousSystem {
    pub fn new(node_id: &str) -> Self {
        Self {
            node_id: node_id.to_string(),
            dendritic_tree: DendriticTree { branches: vec![] },
            soma: Soma::new(),
            axon: Axon::new(5.0), // CÃ¢ble de taille standard
        }
    }

    /// RÃ©ception d'un signal chimique depuis la synapse d'un neurone voisin (Ã‰coute des Dendrites)
    pub fn receive_neurotransmitter(&mut self, source_id: &str, signal: &(Neurotransmitter, f64)) {
        // L'arbre dendritique filtre et modifie le signal selon l'Ã©pine concernÃ©e
        let effect = self.dendritic_tree.process_signal(source_id, signal.1);

        match signal.0 {
            Neurotransmitter::Glutamate => self.soma.current_potential += effect, // Excitation (Rapproche de -55mV)
            Neurotransmitter::GABA => self.soma.current_potential -= effect, // Inhibition (Hyperpolarisation)
            Neurotransmitter::Dopamine => {
                // La dopamine renforce brutalement le potentiel et aide Ã  consolider
                self.soma.current_potential += effect * 1.5;
            }
            Neurotransmitter::Serotonin => {
                // Stabilise le potentiel vers son Ã©tat de repos
                self.soma.current_potential = self.soma.resting_potential;
            }
        }
    }

    /// Le CÃ´ne d'Ã©mergence fait le calcul et l'usine expÃ©die les vÃ©sicules
    pub fn process_soma(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        // 1. L'Usine du Soma tourne : elle produit 2.0 vÃ©sicules en permanence et les met sur l'autoroute
        self.axon.process_logistics(2.0);

        // 2. Le CÃ´ne d'Ã©mergence vÃ©rifie le calcul Ã©lectrique
        if self.soma.evaluate_axon_hillock() {
            // DÃ‰CHARGE Ã‰LECTRIQUE ! L'Axone fait feu !
            self.axon.trigger_action_potential()
        } else {
            None
        }
    }

    /// NEUROPLASTICITÃ‰ : La machine Ã  apprendre (Loi de Hebb)
    pub fn apply_neuroplasticity(&mut self) {
        // 1. PlasticitÃ© structurelle : Les Dendrites poussent ou se rÃ©tractent
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
                // 2. Ã‰lagage Synaptique (Pruning) : Les connexions inutilisÃ©es s'affaiblissent
                synapse.weight -= 0.02;
            }
        }

        // 3. MyÃ©linisation : Si le neurone tire souvent, son cÃ¢ble (Axone) s'isole de graisse (MyÃ©line)
        // C'est ce qui transforme un geste hÃ©sitant en automatisme fulgurant !
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

        // 4. Nettoyage : On dÃ©truit dÃ©finitivement les synapses mortes
        self.axon.terminals.retain(|s| s.weight > 0.0);
    }
}
