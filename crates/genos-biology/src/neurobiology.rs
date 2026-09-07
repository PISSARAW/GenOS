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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum CompartmentType {
    Soma,
    ProximalTrunk,
    ApicalDendrite,
    BasalDendrite,
    DistalTuft,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SpineMorphology {
    Filopodia, // Épine exploratoire très motile, faible densité AMPA initiale
    Thin,      // Épine d'apprentissage à haute plasticité (LTP active)
    Stubby,    // Épine intermédiaire de transition
    Mushroom,  // Épine de mémoire consolidée, large tête PSD-95, haute densité AMPA, protégée par CD47
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticSpine {
    pub source_id: String,             // L'axone afférent du neurone voisin
    pub morphology: SpineMorphology,   // Morphologie biophysique de l'épine
    pub receptor_density: f64,         // Volume physique / surface de l'épine
    pub ampa_receptors: f64,          // Conductance postsynaptique rapide AMPA
    pub nmda_receptors: f64,          // Détecteur de coïncidence NMDA (plasticité)
    pub c3_opsonization: f64,          // Marqueur d'élimination "Eat Me" (Complément C3)
    pub cd47_expression: f64,          // Marqueur protecteur "Don't Eat Me" (CD47)
    pub activity_history: u32,         // Historique d'activation
}

impl DendriticSpine {
    pub fn new(source_id: &str, morphology: SpineMorphology) -> Self {
        let (ampa, nmda, cd47, density) = match morphology {
            SpineMorphology::Filopodia => (0.3, 1.2, 0.4, 0.6),
            SpineMorphology::Thin => (0.8, 1.0, 0.8, 1.0),
            SpineMorphology::Stubby => (1.0, 0.8, 1.0, 1.2),
            SpineMorphology::Mushroom => (1.8, 0.6, 1.8, 2.0),
        };
        Self {
            source_id: source_id.to_string(),
            morphology,
            receptor_density: density,
            ampa_receptors: ampa,
            nmda_receptors: nmda,
            c3_opsonization: 0.0,
            cd47_expression: cd47,
            activity_history: 0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticCompartment {
    pub id: String,
    pub compartment_type: CompartmentType,
    pub parent_id: Option<String>,
    pub electrotonic_distance: f64, // Distance électrotonique x relative au soma
    pub length_constant: f64,       // Constante d'espace lambda (Wilfrid Rall)
    pub nmda_threshold: f64,        // Seuil d'activation supralinéaire (NMDA spike)
    pub spines: Vec<DendriticSpine>,
}

impl DendriticCompartment {
    pub fn new(
        id: &str,
        compartment_type: CompartmentType,
        parent_id: Option<String>,
        electrotonic_distance: f64,
        length_constant: f64,
    ) -> Self {
        Self {
            id: id.to_string(),
            compartment_type,
            parent_id,
            electrotonic_distance: electrotonic_distance.max(0.0),
            length_constant: length_constant.max(0.01),
            nmda_threshold: 12.0,
            spines: Vec::new(),
        }
    }

    /// Atténuation selon la théorie du câble de Wilfrid Rall : V(soma) = V(local) * exp(-x / lambda)
    pub fn cable_attenuation(&self) -> f64 {
        (-self.electrotonic_distance / self.length_constant).exp()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DendriticTree {
    pub compartments: Vec<DendriticCompartment>,
    pub max_spines_per_compartment: usize,
    pub sprout_atp_cost: f64,
}

impl Default for DendriticTree {
    fn default() -> Self {
        Self::new()
    }
}

impl DendriticTree {
    pub const DEFAULT_MAX_SPINES: usize = 32;
    pub const DEFAULT_SPROUT_ATP_COST: f64 = 2.0;

    pub fn new() -> Self {
        Self {
            compartments: vec![
                DendriticCompartment::new("proximal_trunk", CompartmentType::ProximalTrunk, None, 0.15, 1.0),
                DendriticCompartment::new("apical_oblique", CompartmentType::ApicalDendrite, Some("proximal_trunk".into()), 0.75, 1.0),
                DendriticCompartment::new("basal_arbor", CompartmentType::BasalDendrite, None, 0.40, 1.0),
                DendriticCompartment::new("distal_tuft", CompartmentType::DistalTuft, Some("apical_oblique".into()), 1.40, 1.0),
            ],
            max_spines_per_compartment: Self::DEFAULT_MAX_SPINES,
            sprout_atp_cost: Self::DEFAULT_SPROUT_ATP_COST,
        }
    }

    pub fn total_spines(&self) -> usize {
        self.compartments.iter().map(|c| c.spines.len()).sum()
    }

    pub fn get_compartment(&self, id: &str) -> Option<&DendriticCompartment> {
        self.compartments.iter().find(|c| c.id == id)
    }

    pub fn get_compartment_mut(&mut self, id: &str) -> Option<&mut DendriticCompartment> {
        self.compartments.iter_mut().find(|c| c.id == id)
    }

    pub fn process_signal(&mut self, source_id: &str, amount: f64) -> f64 {
        self.process_signal_on_compartment(source_id, amount, "apical_oblique")
    }

    pub fn process_signal_on_compartment(&mut self, source_id: &str, amount: f64, target_compartment_id: &str) -> f64 {
        // Recherche si une épine existe déjà sur n'importe quel compartiment
        let mut target_comp_idx = 0;
        let mut found_spine = false;

        for (idx, comp) in self.compartments.iter().enumerate() {
            if comp.spines.iter().any(|s| s.source_id == source_id) {
                target_comp_idx = idx;
                found_spine = true;
                break;
            }
        }

        if !found_spine {
            // Sélectionne le compartiment cible demandé ou le premier disponible
            target_comp_idx = self
                .compartments
                .iter()
                .position(|c| c.id == target_compartment_id)
                .unwrap_or(0);

            let new_spine = DendriticSpine::new(source_id, SpineMorphology::Filopodia);
            self.compartments[target_comp_idx].spines.push(new_spine);
        }

        let compartment = &mut self.compartments[target_comp_idx];
        let spine = compartment
            .spines
            .iter_mut()
            .find(|s| s.source_id == source_id)
            .unwrap();

        spine.activity_history += 1;

        // Potentiel postsynaptique local (EPSP) calculé via conductance AMPA et surface de l'épine
        let mut local_epsp = amount * (spine.ampa_receptors * 0.7 + spine.receptor_density * 0.3);

        // Intégration non-linéaire : si le signal local dépasse le seuil NMDA, génération d'un pic dendritique supralinéaire
        if local_epsp >= compartment.nmda_threshold {
            local_epsp *= 1.35; // Amplification non-linéaire (NMDA spike)
        }

        // Atténuation passive de câble jusqu'au soma selon Wilfrid Rall
        let attenuation = compartment.cable_attenuation();
        local_epsp * attenuation
    }

    pub fn process_signal_with_metabolism(
        &mut self,
        source_id: &str,
        amount: f64,
        target_compartment_id: &str,
        atp_budget: &mut f64,
    ) -> Result<f64, String> {
        // Recherche si une épine existe déjà sur n'importe quel compartiment
        for comp in self.compartments.iter_mut() {
            if let Some(spine) = comp.spines.iter_mut().find(|s| s.source_id == source_id) {
                spine.activity_history += 1;
                let mut local_epsp = amount * (spine.ampa_receptors * 0.7 + spine.receptor_density * 0.3);
                if local_epsp >= comp.nmda_threshold {
                    local_epsp *= 1.35;
                }
                return Ok(local_epsp * comp.cable_attenuation());
            }
        }

        // Aucune épine existante : bourgeonnement soumis au budget métabolique
        let target_comp_idx = self
            .compartments
            .iter()
            .position(|c| c.id == target_compartment_id)
            .unwrap_or(0);

        if self.compartments[target_comp_idx].spines.len() >= self.max_spines_per_compartment {
            return Err(format!(
                "Saturation du compartiment {} : limite de {} épines atteinte",
                target_compartment_id, self.max_spines_per_compartment
            ));
        }

        if *atp_budget < self.sprout_atp_cost {
            return Err(format!(
                "Budget ATP insuffisant pour le bourgeonnement d'une épine (requis: {}, disponible: {})",
                self.sprout_atp_cost, atp_budget
            ));
        }

        *atp_budget -= self.sprout_atp_cost;
        let new_spine = DendriticSpine::new(source_id, SpineMorphology::Filopodia);
        self.compartments[target_comp_idx].spines.push(new_spine);

        let comp = &mut self.compartments[target_comp_idx];
        let spine = comp.spines.last_mut().unwrap();
        spine.activity_history += 1;
        let mut local_epsp = amount * (spine.ampa_receptors * 0.7 + spine.receptor_density * 0.3);
        if local_epsp >= comp.nmda_threshold {
            local_epsp *= 1.35;
        }
        Ok(local_epsp * comp.cable_attenuation())
    }

    pub fn prune_inactive_spines(&mut self, minimum_density: f64) -> usize {
        let mut pruned_count = 0;
        for compartment in self.compartments.iter_mut() {
            let initial_len = compartment.spines.len();
            compartment.spines.retain(|s| {
                s.receptor_density > minimum_density
                    && !(s.c3_opsonization > 0.8 && s.cd47_expression < 0.2)
            });
            pruned_count += initial_len - compartment.spines.len();
        }
        pruned_count
    }

    /// STDP Postsynaptique : ajuste la morphologie et la conductance de l'épine dendritique
    pub fn apply_postsynaptic_stdp(&mut self, source_id: &str, delta_t: f64, learning_rate: f64) -> Option<f64> {
        let tau_plus = 20.0;
        let tau_minus = 20.0;

        for comp in self.compartments.iter_mut() {
            if let Some(spine) = comp.spines.iter_mut().find(|s| s.source_id == source_id) {
                let delta_dw = if delta_t > 0.0 {
                    learning_rate * (-delta_t.abs() / tau_plus).exp()
                } else if delta_t < 0.0 {
                    -learning_rate * (-delta_t.abs() / tau_minus).exp()
                } else {
                    0.0
                };

                if delta_dw > 0.0 {
                    // LTP postsynaptique : croissance de l'épine et accumulation d'AMPA
                    spine.receptor_density = (spine.receptor_density + delta_dw * 2.0).min(3.5);
                    spine.ampa_receptors = (spine.ampa_receptors + delta_dw * 2.5).min(3.0);
                    spine.cd47_expression = (spine.cd47_expression + delta_dw * 1.5).min(2.0);
                    spine.c3_opsonization = 0.0;

                    if spine.receptor_density > 1.8 && spine.morphology != SpineMorphology::Mushroom {
                        spine.morphology = SpineMorphology::Mushroom;
                    } else if spine.morphology == SpineMorphology::Filopodia {
                        spine.morphology = SpineMorphology::Thin;
                    }
                } else if delta_dw < 0.0 {
                    // LTD postsynaptique : rétractation et marquage C3
                    spine.receptor_density = (spine.receptor_density + delta_dw).max(0.1);
                    spine.ampa_receptors = (spine.ampa_receptors + delta_dw * 1.5).max(0.05);
                    spine.cd47_expression = (spine.cd47_expression + delta_dw).max(0.0);
                    spine.c3_opsonization = (spine.c3_opsonization - delta_dw * 1.5).min(2.0);

                    if spine.receptor_density < 0.8 && spine.morphology == SpineMorphology::Mushroom {
                        spine.morphology = SpineMorphology::Stubby;
                    }
                }

                spine.activity_history += 1;
                return Some(spine.receptor_density);
            }
        }
        None
    }

    pub fn apply_structural_plasticity(&mut self) {
        for compartment in self.compartments.iter_mut() {
            for spine in compartment.spines.iter_mut() {
                if spine.activity_history > 0 {
                    // Renforcement postsynaptique : transition morphologique dépendante de l'activité
                    match spine.morphology {
                        SpineMorphology::Filopodia => {
                            spine.morphology = SpineMorphology::Thin;
                            spine.receptor_density = 1.0;
                            spine.ampa_receptors = 0.9;
                            spine.cd47_expression = 1.0;
                        }
                        SpineMorphology::Thin => {
                            if spine.activity_history >= 2 {
                                spine.morphology = SpineMorphology::Mushroom;
                                spine.receptor_density = (spine.receptor_density + 0.2).min(3.0);
                                spine.ampa_receptors = (spine.ampa_receptors + 0.3).min(2.5);
                                spine.cd47_expression = (spine.cd47_expression + 0.4).min(2.0);
                            } else {
                                spine.receptor_density = (spine.receptor_density + 0.05).min(2.0);
                                spine.ampa_receptors = (spine.ampa_receptors + 0.1).min(2.0);
                            }
                        }
                        SpineMorphology::Stubby => {
                            spine.morphology = SpineMorphology::Mushroom;
                            spine.receptor_density = (spine.receptor_density + 0.2).min(3.0);
                            spine.ampa_receptors = (spine.ampa_receptors + 0.2).min(2.5);
                        }
                        SpineMorphology::Mushroom => {
                            spine.receptor_density = (spine.receptor_density + 0.05 * spine.activity_history as f64).min(3.5);
                            spine.ampa_receptors = (spine.ampa_receptors + 0.05).min(2.5);
                            spine.cd47_expression = (spine.cd47_expression + 0.1).min(2.0);
                        }
                    }
                    spine.c3_opsonization = 0.0; // Effacement du marquage "Eat Me"
                    spine.activity_history = 0;
                } else {
                    // Dépression / Atrophie postsynaptique par inactivité
                    match spine.morphology {
                        SpineMorphology::Mushroom => {
                            // Les épines Mushroom sont protégées et régressent lentement en Stubby
                            spine.receptor_density -= 0.02;
                            spine.cd47_expression = (spine.cd47_expression - 0.05).max(0.0);
                            if spine.receptor_density < 1.3 {
                                spine.morphology = SpineMorphology::Stubby;
                            }
                        }
                        SpineMorphology::Stubby | SpineMorphology::Thin => {
                            spine.receptor_density -= 0.05;
                            spine.ampa_receptors = (spine.ampa_receptors - 0.05).max(0.0);
                            spine.cd47_expression = (spine.cd47_expression - 0.1).max(0.0);
                            spine.c3_opsonization = (spine.c3_opsonization + 0.15).min(2.0);
                            if spine.receptor_density < 0.6 {
                                spine.morphology = SpineMorphology::Filopodia;
                            }
                        }
                        SpineMorphology::Filopodia => {
                            spine.receptor_density -= 0.10;
                            spine.c3_opsonization = (spine.c3_opsonization + 0.25).min(2.0);
                        }
                    }
                }
            }
        }

        // Élagage (Pruning) : disparition des épines éteintes ou ciblées par C3/CD47
        self.prune_inactive_spines(0.0);
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
            dendritic_tree: DendriticTree::new(),
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

        // 4. Nettoyage : On détruit définitivement les synapses mortes (weight <= 0)
        // ou phagocytées suite au marquage opsonisant ("Eat Me" C3 > 0.8 et "Don't Eat Me" CD47 < 0.2)
        self.axon.terminals.retain(|s| s.weight > 0.0 && !(s.c3_opsonization > 0.8 && s.cd47_expression < 0.2));
    }
}

impl NervousSystem {
    /// Établit une connexion synaptique complète entre ce neurone (axone présynaptique)
    /// et le neurone cible (épine postsynaptique dans le compartiment sélectionné)
    pub fn form_synaptic_connection(
        &mut self,
        target: &mut NervousSystem,
        weight: f64,
        transmitter: Neurotransmitter,
        target_compartment: Option<&str>,
    ) {
        // Bouton présynaptique sur l'axone
        self.axon.terminals.push(Synapse::new(target.node_id.clone(), weight, transmitter));

        // Épine dendritique postsynaptique sur le compartiment cible
        let comp_id = target_compartment.unwrap_or("apical_oblique");
        if let Some(comp) = target.dendritic_tree.get_compartment_mut(comp_id) {
            let mut spine = DendriticSpine::new(&self.node_id, SpineMorphology::Thin);
            spine.receptor_density = (weight * 2.0).clamp(0.5, 2.5);
            comp.spines.push(spine);
        }
    }

    /// Transmet un train de potentiel d'action du soma présynaptique vers le récepteur
    pub fn transmit_signal(sender: &mut NervousSystem, receiver: &mut NervousSystem) -> usize {
        let mut delivered_count = 0;
        if let Some(signals) = sender.process_soma() {
            for (target_id, transmitter, amount) in signals {
                if target_id == receiver.node_id {
                    receiver.receive_neurotransmitter(
                        &sender.node_id,
                        &NeuroSignal { transmitter, amount },
                    );
                    delivered_count += 1;
                }
            }
        }
        delivered_count
    }

    pub fn apply_stdp(&mut self, target_id: &str, delta_t: f64, learning_rate: f64) -> Option<f64> {
        self.axon.apply_stdp(target_id, delta_t, learning_rate)
    }

    pub fn apply_postsynaptic_stdp(&mut self, source_id: &str, delta_t: f64, learning_rate: f64) -> Option<f64> {
        self.dendritic_tree.apply_postsynaptic_stdp(source_id, delta_t, learning_rate)
    }
}

impl Axon {
    /// STDP : Spike-Timing-Dependent Plasticity
    /// delta_t = post_spike_time - pre_spike_time (en ms)
    /// Si delta_t > 0 : causalité pré-post -> LTP (Long-Term Potentiation)
    /// Si delta_t < 0 : corrélation inversée -> LTD (Long-Term Depression)
    pub fn apply_stdp(&mut self, target_id: &str, delta_t: f64, learning_rate: f64) -> Option<f64> {
        let synapse = self.terminals.iter_mut().find(|s| s.target_id == target_id)?;
        let tau_plus = 20.0;
        let tau_minus = 20.0;

        let delta_w = if delta_t > 0.0 {
            learning_rate * (-delta_t.abs() / tau_plus).exp()
        } else if delta_t < 0.0 {
            -learning_rate * (-delta_t.abs() / tau_minus).exp()
        } else {
            0.0
        };

        // Modulation hétérosynaptique selon le neurotransmetteur (modèle 3-facteurs)
        let modulated_dw = match synapse.transmitter_type {
            Neurotransmitter::Dopamine => delta_w * 1.5,
            Neurotransmitter::Serotonin => delta_w * 0.8,
            _ => delta_w,
        };

        if modulated_dw > 0.0 {
            synapse.weight = (synapse.weight + modulated_dw).min(1.0);
            synapse.ampa_receptors = (synapse.ampa_receptors + 0.1).min(2.0);
            synapse.cd47_expression = (synapse.cd47_expression + 0.2).min(2.0);
            synapse.c3_opsonization = 0.0;
        } else if modulated_dw < 0.0 {
            synapse.weight = (synapse.weight + modulated_dw).max(0.01);
            synapse.ampa_receptors = (synapse.ampa_receptors - 0.1).max(0.0);
            synapse.cd47_expression = (synapse.cd47_expression - 0.1).max(0.0);
            synapse.c3_opsonization = (synapse.c3_opsonization + 0.1).min(2.0);
        }

        synapse.activity_history += 1;
        Some(synapse.weight)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stdp_potentiation_and_depression() {
        let mut ns = NervousSystem::new("node_test");
        ns.axon.terminals.push(Synapse::new(
            "target_node".to_string(),
            0.5,
            Neurotransmitter::Glutamate,
        ));

        // 1. LTP : pre precedes post (delta_t = +10.0 ms)
        let ltp_res = ns.apply_stdp("target_node", 10.0, 0.2);
        assert!(ltp_res.is_some());
        let ltp_weight = ltp_res.unwrap();
        assert!(ltp_weight > 0.5, "LTP doit augmenter le poids synaptique");
        let syn = &ns.axon.terminals[0];
        assert!(syn.ampa_receptors > 1.0, "LTP doit augmenter les recepteurs AMPA");
        assert_eq!(syn.c3_opsonization, 0.0, "LTP doit effacer le marquage C3");

        // 2. LTD : post precedes pre (delta_t = -10.0 ms)
        let ltd_res = ns.apply_stdp("target_node", -10.0, 0.1);
        assert!(ltd_res.is_some());
        let ltd_weight = ltd_res.unwrap();
        assert!(ltd_weight < ltp_weight, "LTD doit diminuer le poids synaptique");
        assert!(ltd_weight >= 0.01, "Le poids doit rester positif (conductance)");
        let syn_ltd = &ns.axon.terminals[0];
        assert!(syn_ltd.c3_opsonization > 0.0, "LTD doit marquer le complement C3");
    }

    #[test]
    fn test_stdp_dopamine_modulation() {
        let mut ns_glu = NervousSystem::new("node_glu");
        ns_glu.axon.terminals.push(Synapse::new("target".to_string(), 0.3, Neurotransmitter::Glutamate));
        let glu_weight = ns_glu.apply_stdp("target", 10.0, 0.2).unwrap();

        let mut ns_dop = NervousSystem::new("node_dop");
        ns_dop.axon.terminals.push(Synapse::new("target".to_string(), 0.3, Neurotransmitter::Dopamine));
        let dop_weight = ns_dop.apply_stdp("target", 10.0, 0.2).unwrap();

        assert!(
            dop_weight > glu_weight,
            "La dopamine doit amplifier le renforcement STDP (3-facteurs)"
        );
    }

    #[test]
    fn test_dendritic_cable_attenuation_and_compartments() {
        let mut tree = DendriticTree::new();

        // Signal sur le tronc proximal (x = 0.15)
        let epsp_proximal = tree.process_signal_on_compartment("source_prox", 10.0, "proximal_trunk");

        // Signal sur la touffe distale (x = 1.40)
        let epsp_distal = tree.process_signal_on_compartment("source_dist", 10.0, "distal_tuft");

        // Rall cable theory : l'atténuation est plus forte pour le compartiment distal
        assert!(
            epsp_proximal > epsp_distal,
            "L'atténuation de câble de Rall doit réduire davantage le signal distal ({}) que proximal ({})",
            epsp_distal, epsp_proximal
        );

        // Intégration supralinéaire : seuil NMDA dépassé
        let high_signal_epsp = tree.process_signal_on_compartment("source_prox", 50.0, "proximal_trunk");
        let expected_linear = (high_signal_epsp / 50.0) * 10.0;
        assert!(
            high_signal_epsp > expected_linear * 1.2,
            "Un signal fort doit déclencher un pic NMDA supralinéaire"
        );
    }

    #[test]
    fn test_spine_morphology_transition_and_pruning() {
        let mut tree = DendriticTree::new();

        // 1. Bourgeonnement initial : doit être Filopodia
        tree.process_signal("pre_neuron", 5.0);
        let spine = &tree.get_compartment("apical_oblique").unwrap().spines[0];
        assert_eq!(spine.morphology, SpineMorphology::Filopodia);

        // 2. Première activation : transition vers Thin
        tree.apply_structural_plasticity();
        let spine_thin = &tree.get_compartment("apical_oblique").unwrap().spines[0];
        assert_eq!(spine_thin.morphology, SpineMorphology::Thin);

        // 3. Activations répétées : transition vers Mushroom (mémoire consolidée)
        tree.process_signal("pre_neuron", 10.0);
        tree.process_signal("pre_neuron", 10.0);
        tree.apply_structural_plasticity();
        let spine_mushroom = &tree.get_compartment("apical_oblique").unwrap().spines[0];
        assert_eq!(spine_mushroom.morphology, SpineMorphology::Mushroom);
        assert!(spine_mushroom.ampa_receptors >= 1.1);
        assert!(spine_mushroom.cd47_expression >= 1.2);

        // 4. Inactivité prolongée et élagage
        for _ in 0..15 {
            tree.apply_structural_plasticity();
        }
        let count = tree.total_spines();
        assert!(count <= 1, "L'inactivité doit résorber ou élaguer les épines");
    }

    #[test]
    fn test_dendritic_metabolic_atp_cost() {
        let mut tree = DendriticTree::new();
        let mut atp = 1.0; // Moins que DEFAULT_SPROUT_ATP_COST (2.0)

        // Doit échouer car budget insuffisant
        let err = tree.process_signal_with_metabolism("new_src", 5.0, "apical_oblique", &mut atp);
        assert!(err.is_err(), "Le bourgeonnement doit échouer si le budget ATP est insuffisant");

        // Avec assez d'ATP
        atp = 10.0;
        let res = tree.process_signal_with_metabolism("new_src", 5.0, "apical_oblique", &mut atp);
        assert!(res.is_ok());
        assert_eq!(atp, 8.0, "Le coût en ATP (2.0) doit être déduit du budget cellulaire");
    }

    #[test]
    fn test_synaptic_connection_and_transmission() {
        let mut pre = NervousSystem::new("cortex_pre");
        let mut post = NervousSystem::new("cortex_post");

        // Connexion synaptique complète
        pre.form_synaptic_connection(&mut post, 0.8, Neurotransmitter::Glutamate, Some("apical_oblique"));
        assert_eq!(pre.axon.terminals.len(), 1);
        assert_eq!(post.dendritic_tree.total_spines(), 1);

        // Remplir les vésicules et déclencher l'action potential
        pre.soma.current_potential = -50.0; // Dépasse le seuil de -55mV
        pre.axon.vesicles_at_terminals = 50.0;
        let delivered = NervousSystem::transmit_signal(&mut pre, &mut post);
        assert_eq!(delivered, 1);
        assert!(post.soma.current_potential > post.soma.resting_potential);
    }

    #[test]
    fn test_postsynaptic_stdp() {
        let mut tree = DendriticTree::new();
        tree.process_signal("afferent_1", 5.0);

        // LTP postsynaptique (delta_t = +10ms)
        let ltp_density = tree.apply_postsynaptic_stdp("afferent_1", 10.0, 0.3);
        assert!(ltp_density.is_some());
        assert!(ltp_density.unwrap() > 0.6);

        // LTD postsynaptique (delta_t = -10ms)
        let ltd_density = tree.apply_postsynaptic_stdp("afferent_1", -10.0, 0.2);
        assert!(ltd_density.is_some());
        assert!(ltd_density.unwrap() < ltp_density.unwrap());
    }
}



