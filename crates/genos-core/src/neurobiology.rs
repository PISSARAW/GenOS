use serde::{Deserialize, Serialize};

/* =====================================================================
   SYSTÈME NERVEUX ET NEURONES
   ===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Neurotransmitter {
    Glutamate, // Excitateur (Déclenche le potentiel d'action)
    GABA,      // Inhibiteur (Bloque le signal électrique)
    Dopamine,  // Renforcement (Motivation et apprentissage positif)
    Serotonin, // Modulation (Stabilisation du réseau)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Synapse {
    pub target_id: String,
    pub weight: f64, // Plasticité : Force de la connexion.
    pub transmitter_type: Neurotransmitter,
    pub activity_history: u32, // Trace de l'utilisation récente
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticSpine {
    pub source_id: String,       // L'axone du neurone voisin
    pub receptor_density: f64,   // Volume physique de l'épine (multiplicateur du signal)
    pub activity_history: u32,   // Historique pour la plasticité structurelle
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticTree {
    pub branches: Vec<DendriticSpine>,
}

impl DendriticTree {
    pub fn process_signal(&mut self, source_id: &str, amount: f64) -> f64 {
        // Trouve l'épine dendritique ou en fait pousser une nouvelle !
        let spine = match self.branches.iter_mut().find(|s| s.source_id == source_id) {
            Some(s) => s,
            None => {
                self.branches.push(DendriticSpine {
                    source_id: source_id.to_string(),
                    receptor_density: 1.0, // Densité de base
                    activity_history: 0,
                });
                self.branches.last_mut().unwrap()
            }
        };
        
        spine.activity_history += 1;
        // Le signal est amplifié ou diminué par la taille physique de l'épine
        amount * spine.receptor_density
    }

    pub fn apply_structural_plasticity(&mut self) {
        for spine in self.branches.iter_mut() {
            if spine.activity_history > 0 {
                // L'épine grossit physiquement (Renforcement postsynaptique)
                spine.receptor_density += 0.05 * (spine.activity_history as f64);
                if spine.receptor_density > 3.0 { spine.receptor_density = 3.0; } // Taille maximale
                spine.activity_history = 0;
            } else {
                // Rétractation de l'épine par manque de stimulation
                spine.receptor_density -= 0.05;
            }
        }
        // Disparition complète des épines inutilisées (élagage / pruning)
        self.branches.retain(|s| s.receptor_density > 0.0);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Soma {
    /// Le potentiel électrique actuel en millivolts (mV).
    pub current_potential: f64,
    /// Potentiel de repos, généralement autour de -70 mV.
    pub resting_potential: f64,
    /// Le seuil d'excitation au Cône d'émergence (Zone Gâchette), généralement -55 mV.
    pub threshold_potential: f64,
    /// Vitesse à laquelle le potentiel retombe au repos (fuite d'ions), gère la sommation temporelle.
    pub potential_decay_rate: f64,
}

impl Soma {
    pub fn new() -> Self {
        Self {
            current_potential: -70.0,
            resting_potential: -70.0,
            threshold_potential: -55.0,
            potential_decay_rate: 2.0, // Retombe de 2mV par cycle d'inactivité
        }
    }

    /// Le Cône d'émergence (Axon Hillock) évalue la sommation spatiale et temporelle
    pub fn evaluate_axon_hillock(&mut self) -> bool {
        if self.current_potential >= self.threshold_potential {
            // LOI DU TOUT OU RIEN : La gâchette est pressée !
            // (En réalité ça monte à +40mV, puis ça chute). On réinitialise pour la période réfractaire.
            self.current_potential = self.resting_potential;
            true
        } else {
            // Pas assez d'excitation. Le signal meurt à petit feu (Sommation Temporelle).
            if self.current_potential > self.resting_potential {
                self.current_potential -= self.potential_decay_rate;
                if self.current_potential < self.resting_potential {
                    self.current_potential = self.resting_potential;
                }
            } else if self.current_potential < self.resting_potential {
                // Si inhibé (hyperpolarisation), remonte vers le repos
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
    /// Longueur du câble (détermine le temps de trajet logistique)
    pub length: f64,
    /// Gaine de myéline (0.0 = Conduction lente avec fuites, 1.0 = Conduction saltatoire ultra-rapide sans perte)
    pub myelination_level: f64,
    /// Stock de neurotransmetteurs aux terminaisons, prêt à être largué
    pub vesicles_at_terminals: f64,
    /// L'autoroute logistique : Transport de vésicules sur les microtubules
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

    /// L'autoroute à double sens : Fait avancer les protéines-moteurs (Kinesines)
    pub fn process_logistics(&mut self, soma_production: f64) {
        if soma_production > 0.0 {
            // Le trajet dépend de la longueur de l'axone (ex: length 5.0 -> 10 ticks de voyage)
            let travel_time = (self.length * 2.0).max(1.0) as u32;
            self.anterograde_transport.push(AxonalCargo {
                amount: soma_production,
                ticks_remaining: travel_time,
            });
        }

        // Avancée des cargaisons sur les rails
        for cargo in self.anterograde_transport.iter_mut() {
            cargo.ticks_remaining = cargo.ticks_remaining.saturating_sub(1);
        }

        // Arrivée aux terminaisons
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

    /// Déclenchement de la décharge !
    pub fn trigger_action_potential(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        let cost_per_spike = 10.0;
        
        // Loi du "Tout ou Rien" : l'intensité électrique initiale est constante, 
        // mais a-t-on assez de neurotransmetteurs à larguer ?
        if self.vesicles_at_terminals >= cost_per_spike {
            self.vesicles_at_terminals -= cost_per_spike;

            // L'isolation par la Gaine de Myéline empêche le signal électrique de "fuir"
            // Avec 1.0 (Nœuds de Ranvier), 100% du signal arrive intact. Sinon, il se dissipe.
            let conduction_efficiency = 0.2 + (0.8 * self.myelination_level);
            let delivered_signal = 20.0 * conduction_efficiency;

            let mut outputs = vec![];
            for synapse in self.terminals.iter_mut() {
                let released_amount = delivered_signal * synapse.weight;
                outputs.push((synapse.target_id.clone(), synapse.transmitter_type.clone(), released_amount));
                synapse.activity_history += 1;
            }
            Some(outputs)
        } else {
            // Épuisement synaptique : L'axone a tiré trop de fois (Haute fréquence), 
            // la logistique (l'autoroute) n'a pas suivi la cadence. Le neurone "tire à blanc".
            None
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NervousSystem {
    pub node_id: String,
    
    // 1. Les Dendrites (Les racines / Les antennes de réception avec épines)
    pub dendritic_tree: DendriticTree,
    
    // 2. Le Corps Cellulaire / Soma (L'usine et le centre de calcul)
    pub soma: Soma,
    
    // 3. L'Axone (Le grand câble de transmission et l'autoroute logistique)
    pub axon: Axon,
}

impl NervousSystem {
    pub fn new(node_id: &str) -> Self {
        Self {
            node_id: node_id.to_string(),
            dendritic_tree: DendriticTree { branches: vec![] },
            soma: Soma::new(),
            axon: Axon::new(5.0), // Câble de taille standard
        }
    }

    /// Réception d'un signal chimique depuis la synapse d'un neurone voisin (Écoute des Dendrites)
    pub fn receive_neurotransmitter(&mut self, source_id: &str, transmitter: &Neurotransmitter, amount: f64) {
        // L'arbre dendritique filtre et modifie le signal selon l'épine concernée
        let effect = self.dendritic_tree.process_signal(source_id, amount);
        
        match transmitter {
            Neurotransmitter::Glutamate => self.soma.current_potential += effect, // Excitation (Rapproche de -55mV)
            Neurotransmitter::GABA => self.soma.current_potential -= effect,      // Inhibition (Hyperpolarisation)
            Neurotransmitter::Dopamine => {
                // La dopamine renforce brutalement le potentiel et aide à consolider
                self.soma.current_potential += effect * 1.5;
            },
            Neurotransmitter::Serotonin => {
                // Stabilise le potentiel vers son état de repos
                self.soma.current_potential = self.soma.resting_potential; 
            }
        }
    }

    /// Le Cône d'émergence fait le calcul et l'usine expédie les vésicules
    pub fn process_soma(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        // 1. L'Usine du Soma tourne : elle produit 2.0 vésicules en permanence et les met sur l'autoroute
        self.axon.process_logistics(2.0);

        // 2. Le Cône d'émergence vérifie le calcul électrique
        if self.soma.evaluate_axon_hillock() {
            // DÉCHARGE ÉLECTRIQUE ! L'Axone fait feu !
            self.axon.trigger_action_potential()
        } else {
            None
        }
    }

    /// NEUROPLASTICITÉ : La machine à apprendre (Loi de Hebb)
    pub fn apply_neuroplasticity(&mut self) {
        // 1. Plasticité structurelle : Les Dendrites poussent ou se rétractent
        self.dendritic_tree.apply_structural_plasticity();
        
        let mut total_activity = 0;
        
        // "Les neurones qui s'activent ensemble se lient ensemble"
        for synapse in self.axon.terminals.iter_mut() {
            if synapse.activity_history > 0 {
                // 1. Renforcement de la Synapse
                synapse.weight += 0.05 * (synapse.activity_history as f64);
                if synapse.weight > 1.0 { synapse.weight = 1.0; } // Plafond
                
                total_activity += synapse.activity_history;
                synapse.activity_history = 0; // Reset pour la nuit / cycle suivant
            } else {
                // 2. Élagage Synaptique (Pruning) : Les connexions inutilisées s'affaiblissent
                synapse.weight -= 0.02;
            }
        }

        // 3. Myélinisation : Si le neurone tire souvent, son câble (Axone) s'isole de graisse (Myéline)
        // C'est ce qui transforme un geste hésitant en automatisme fulgurant !
        if total_activity > 0 {
            self.axon.myelination_level += 0.05;
            if self.axon.myelination_level > 1.0 { self.axon.myelination_level = 1.0; }
        } else {
            self.axon.myelination_level -= 0.01;
            if self.axon.myelination_level < 0.1 { self.axon.myelination_level = 0.1; }
        }

        // 4. Nettoyage : On détruit définitivement les synapses mortes
        self.axon.terminals.retain(|s| s.weight > 0.0);
    }
}