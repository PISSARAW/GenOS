use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CompartmentType {
    #[serde(alias = "Soma", alias = "soma")]
    Soma,
    #[serde(alias = "ProximalTrunk", alias = "proximal_trunk", alias = "trunk", alias = "proximal")]
    ProximalTrunk,
    #[serde(alias = "ApicalDendrite", alias = "apical_dendrite", alias = "apical")]
    ApicalDendrite,
    #[serde(alias = "BasalDendrite", alias = "basal_dendrite", alias = "basal")]
    BasalDendrite,
    #[serde(alias = "DistalTuft", alias = "distal_tuft", alias = "tuft", alias = "distal")]
    DistalTuft,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SpineMorphology {
    #[serde(alias = "Filopodia", alias = "filopodia")]
    Filopodia, // Épine exploratoire très motile, faible densité AMPA initiale
    #[serde(alias = "Thin", alias = "thin")]
    Thin,      // Épine d'apprentissage à haute plasticité (LTP active)
    #[serde(alias = "Stubby", alias = "stubby")]
    Stubby,    // Épine intermédiaire de transition
    #[serde(alias = "Mushroom", alias = "mushroom")]
    Mushroom,  // Épine de mémoire consolidée, large tête PSD-95, haute densité AMPA, protégée par CD47
}
pub const C3_PRUNING_THRESHOLD: f64 = 0.5;
pub const CD47_PROTECTION_THRESHOLD: f64 = 0.5;

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
                    && !(s.c3_opsonization > C3_PRUNING_THRESHOLD && s.cd47_expression < CD47_PROTECTION_THRESHOLD)
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
