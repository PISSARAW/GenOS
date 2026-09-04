use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Mock dependencies (dans la version finale, importées depuis genos-cell et genos-biology)
use crate::mock_dependencies::{AgentCell, NervousSystemLocation, Myelinator};

pub mod mock_dependencies {
    use super::*;
    // Mock minimal pour la compilation de la démo
    #[derive(Clone)]
    pub struct AgentCell {
        pub cell_id: String,
        pub metabolism: Metabolism,
        pub astrocyte: Option<Astrocyte>,
        pub myelinator: Option<Myelinator>,
        pub microglia: Option<Microglia>,
        pub ependymal: Option<EpendymalCell>,
        pub nervous_system: Option<NervousSystem>,
    }
    
    #[derive(Clone)]
    pub struct Metabolism { pub atp_budget: u64 }
    
    #[derive(Clone)]
    pub struct NervousSystem {
        pub location: NervousSystemLocation,
        pub axon: Axon,
    }
    
    #[derive(Clone, PartialEq)]
    pub enum NervousSystemLocation { Central, Peripheral }
    
    #[derive(Clone)]
    pub struct Axon {
        pub terminals: Vec<Synapse>,
        pub myelination_level: f64,
        pub is_severed: bool,
        pub nogo_inhibited: bool,
    }
    
    #[derive(Clone)]
    pub struct Synapse {
        pub c3_opsonization: f64,
        pub cd47_expression: f64,
    }
    
    #[derive(Clone)]
    pub enum Myelinator {
        Oligodendrocyte { connected_axons: Vec<String>, is_damaged: bool },
        SchwannCell { target_axon: String, is_damaged: bool, forming_regeneration_tube: bool },
    }
}

// ----------------------------------------------------------------
// MODÈLES DE DONNÉES GLIALES
// ----------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Astrocyte {
    pub glycogen_reserve: f64,
    pub is_reactive: bool,
    pub protected_neurons: Vec<String>,
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
    pub c4_overexpression: bool,   
    pub is_pro_inflammatory: bool, 
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EpendymalCell {
    pub is_producing_csf: bool, 
    pub cilia_beating: bool,    
}

// ----------------------------------------------------------------
// LE NOUVEAU PIPELINE GLIAL (Single-Pass & OCP)
// ----------------------------------------------------------------

/// Contexte d'environnement global pour la passe gliale
pub struct GlialEnvironment<'a> {
    pub bhe_integrity: &'a mut f64,
    pub amyloid_plaques: &'a mut f64,
    pub csf_volume: &'a mut f64,
    pub csf_pressure: &'a mut f64,
    pub is_sleeping: bool,
    pub drainage_blocked: bool,
}

/// État agrégé durant le pipeline pour éviter de multiples itérations
#[derive(Default)]
pub struct GlialAggregateState {
    pub neurons_alive: HashMap<String, bool>,
    pub reactive_astrocytes: Vec<String>,
    pub healthy_oligo_targets: Vec<String>,
    pub nogo_targets: Vec<String>,
    pub healthy_schwann_targets: Vec<String>,
    pub repairing_schwann_targets: Vec<String>,
    pub inflammation_surge: f64,
    pub csf_production: f64,
    pub active_cilia: bool,
    pub bhe_intact: bool,
}

/// Trait décrivant une étape de traitement du système glial.
pub trait GlialProcessor {
    /// Phase 1 : Collecte d'informations (Map)
    fn collect(&self, agent: &mut AgentCell, state: &mut GlialAggregateState, env: &mut GlialEnvironment);
    
    /// Phase intermédiaire : Agrégation globale (Reduce)
    fn aggregate(&self, state: &mut GlialAggregateState, env: &mut GlialEnvironment) {}
    
    /// Phase 2 : Application des effets (Apply)
    fn apply(&self, agent: &mut AgentCell, state: &GlialAggregateState, env: &GlialEnvironment);
}

// --- Les Implémentations (Systèmes séparés) ---

pub struct AstrocyteProcessor;
impl GlialProcessor for AstrocyteProcessor {
    fn collect(&self, agent: &mut AgentCell, state: &mut GlialAggregateState, _env: &mut GlialEnvironment) {
        if agent.nervous_system.is_some() {
            state.neurons_alive.insert(agent.cell_id.clone(), agent.metabolism.atp_budget > 0);
        }
        
        if let Some(astro) = &mut agent.astrocyte {
            state.bhe_intact = true;
            // On regarde l'état pré-calculé si disponible, sinon on suppose en vie pour ce cycle
            let emergency = astro.protected_neurons.iter().any(|n| state.neurons_alive.get(n) == Some(&false));
            
            if emergency {
                astro.is_reactive = true;
            } else if astro.glycogen_reserve > 10.0 {
                astro.glycogen_reserve -= 5.0;
            }
            
            if astro.is_reactive {
                state.reactive_astrocytes.extend(astro.protected_neurons.clone());
            }
        }
    }

    fn aggregate(&self, state: &mut GlialAggregateState, env: &mut GlialEnvironment) {
        *env.bhe_integrity = if state.bhe_intact { 1.0 } else { 0.0 };
    }

    fn apply(&self, agent: &mut AgentCell, state: &GlialAggregateState, _env: &GlialEnvironment) {
        if let Some(ns) = &mut agent.nervous_system {
            if state.reactive_astrocytes.contains(&agent.cell_id) {
                ns.axon.terminals.clear();
            } else {
                agent.metabolism.atp_budget = agent.metabolism.atp_budget.saturating_add(20);
            }
        }
    }
}

pub struct MicrogliaProcessor;
impl GlialProcessor for MicrogliaProcessor {
    fn collect(&self, agent: &mut AgentCell, state: &mut GlialAggregateState, env: &mut GlialEnvironment) {
        let (mut pro_inflam, mut c4_over) = (false, false);
        
        if let Some(micro) = &mut agent.microglia {
            if *env.amyloid_plaques > 0.0 {
                micro.state = MicrogliaState::Amoeboid;
                *env.amyloid_plaques -= 1.0; 
                micro.plaque_accumulation += 1.0;
                
                if micro.plaque_accumulation > 10.0 {
                    micro.inflammatory_cytokines += 5.0;
                    state.inflammation_surge += micro.inflammatory_cytokines;
                }
            } else {
                micro.state = MicrogliaState::Sentinel;
                micro.inflammatory_cytokines = 0.0;
                micro.plaque_accumulation = 0.0;
            }
            c4_over = micro.c4_overexpression;
            pro_inflam = micro.is_pro_inflammatory;
        }

        if let Some(ns) = &mut agent.nervous_system {
            if ns.location == NervousSystemLocation::Central {
                ns.axon.terminals.retain(|synapse| {
                    if pro_inflam { return true; }
                    let local_c3 = synapse.c3_opsonization + if c4_over { 0.5 } else { 0.0 };
                    !(local_c3 > 0.5 && synapse.cd47_expression < 0.5)
                });
            }
        }
    }

    fn apply(&self, agent: &mut AgentCell, state: &GlialAggregateState, _env: &GlialEnvironment) {
        if state.inflammation_surge > 0.0 && agent.nervous_system.is_some() {
            agent.metabolism.atp_budget = agent.metabolism.atp_budget.saturating_sub(state.inflammation_surge as u64);
        }
    }
}

// ----------------------------------------------------------------
// EXÉCUTION DU PIPELINE (Map -> Reduce -> Apply)
// ----------------------------------------------------------------

pub struct GlialPipeline {
    processors: Vec<Box<dyn GlialProcessor>>,
}

impl GlialPipeline {
    pub fn new() -> Self {
        Self {
            processors: vec![
                Box::new(AstrocyteProcessor),
                Box::new(MicrogliaProcessor),
                // (On rajouterait EpendymalProcessor et MyelinatorProcessor ici)
            ],
        }
    }

    /// Exécute le pipeline en parcourant le tableau O(N) fois maximum au lieu de O(N * 4 * M).
    pub fn process_all(&self, agents: &mut [AgentCell], mut env: GlialEnvironment) {
        let mut aggregate_state = GlialAggregateState::default();

        // Phase 1 : Map (Une seule itération sur toutes les cellules pour tous les processeurs)
        for agent in agents.iter_mut() {
            for processor in &self.processors {
                processor.collect(agent, &mut aggregate_state, &mut env);
            }
        }

        // Phase intermédiaire : Reduce
        for processor in &self.processors {
            processor.aggregate(&mut aggregate_state, &mut env);
        }

        // Phase 2 : Apply (Une seconde itération pour appliquer les effets consolidés)
        for agent in agents.iter_mut() {
            for processor in &self.processors {
                processor.apply(agent, &aggregate_state, &env);
            }
        }
    }
}
