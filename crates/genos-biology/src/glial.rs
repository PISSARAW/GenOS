use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use self::glial_cell::{GlialCell, Myelinator, NervousSystemLocation};

pub mod glial_cell {
    use super::*;

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct GlialCell {
        pub cell_id: String,
        pub metabolism: Metabolism,
        pub astrocyte: Option<Astrocyte>,
        pub myelinator: Option<Myelinator>,
        pub microglia: Option<Microglia>,
        pub ependymal: Option<EpendymalCell>,
        pub nervous_system: Option<NervousSystem>,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct Metabolism {
        pub atp_budget: f64,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct NervousSystem {
        pub location: NervousSystemLocation,
        pub axon: Axon,
        #[serde(default)]
        pub dendritic_tree: Option<crate::neurobiology::DendriticTree>,
    }

    pub use crate::neurobiology::NervousSystemLocation;

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct Axon {
        pub terminals: Vec<Synapse>,
        pub myelination_level: f64,
        pub is_severed: bool,
        pub nogo_inhibited: bool,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct Synapse {
        pub c3_opsonization: f64,
        pub cd47_expression: f64,
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
}

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

pub struct GlialEnvironment<'a> {
    pub bhe_integrity: &'a mut f64,
    pub amyloid_plaques: &'a mut f64,
    pub csf_volume: &'a mut f64,
    pub csf_pressure: &'a mut f64,
    pub is_sleeping: bool,
    pub drainage_blocked: bool,
}

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

pub struct GlialContext<'a, 'b> {
    pub state: &'a mut GlialAggregateState,
    pub env: &'a mut GlialEnvironment<'b>,
}

pub struct GlialApplyContext<'a, 'b> {
    pub state: &'a GlialAggregateState,
    pub env: &'a GlialEnvironment<'b>,
}

pub trait GlialProcessor {
    fn collect(&self, agent: &mut GlialCell, ctx: &mut GlialContext);
    fn aggregate(&self, _state: &mut GlialAggregateState, _env: &mut GlialEnvironment) {}
    fn apply(&self, agent: &mut GlialCell, ctx: &GlialApplyContext);
}

#[path = "glial_processors.rs"]
mod glial_processors;
pub use glial_processors::*;

pub struct GlialPipeline {
    processors: Vec<Box<dyn GlialProcessor>>,
}

impl Default for GlialPipeline {
    fn default() -> Self {
        Self::new()
    }
}

impl GlialPipeline {
    pub fn new() -> Self {
        Self {
            processors: vec![
                Box::new(AstrocyteProcessor),
                Box::new(MicrogliaProcessor),
                Box::new(EpendymalProcessor),
                Box::new(MyelinatorProcessor),
            ],
        }
    }

    pub fn process_all(&self, agents: &mut [GlialCell], mut env: GlialEnvironment) {
        let mut aggregate_state = GlialAggregateState::default();

        let mut ctx = GlialContext {
            state: &mut aggregate_state,
            env: &mut env,
        };
        for agent in agents.iter_mut() {
            for processor in &self.processors {
                processor.collect(agent, &mut ctx);
            }
        }

        for processor in &self.processors {
            processor.aggregate(&mut aggregate_state, &mut env);
        }

        let apply_ctx = GlialApplyContext {
            state: &aggregate_state,
            env: &env,
        };
        for agent in agents.iter_mut() {
            for processor in &self.processors {
                processor.apply(agent, &apply_ctx);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn neuron(id: &str, atp_budget: f64) -> GlialCell {
        GlialCell {
            cell_id: id.to_string(),
            metabolism: glial_cell::Metabolism { atp_budget },
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
            nervous_system: Some(glial_cell::NervousSystem {
                location: NervousSystemLocation::Central,
                axon: glial_cell::Axon {
                    terminals: vec![glial_cell::Synapse { c3_opsonization: 0.0, cd47_expression: 1.0 }],
                    myelination_level: 0.5,
                    is_severed: false,
                    nogo_inhibited: false,
                },
                dendritic_tree: Some(crate::neurobiology::DendriticTree::new()),
            }),
        }
    }

    #[test]
    fn reactive_astrocytes_support_neurons_without_deleting_synapses() {
        let mut agent = neuron("neuron-1", 10.0);
        agent.astrocyte = Some(Astrocyte {
            glycogen_reserve: 1.0,
            is_reactive: true,
            protected_neurons: vec!["neuron-1".to_string()],
        });
        let mut bhe = 1.0;
        let mut plaques = 0.0;
        let mut volume = 0.0;
        let mut pressure = 10.0;
        let mut agents = vec![agent];
        GlialPipeline::new().process_all(&mut agents, GlialEnvironment {
            bhe_integrity: &mut bhe,
            amyloid_plaques: &mut plaques,
            csf_volume: &mut volume,
            csf_pressure: &mut pressure,
            is_sleeping: false,
            drainage_blocked: false,
        });
        assert_eq!(agents[0].nervous_system.as_ref().unwrap().axon.terminals.len(), 1);
    }

    #[test]
    fn ependymal_pressure_and_microglial_inflammation_remain_bounded() {
        let mut agent = neuron("neuron-2", 100.0);
        agent.ependymal = Some(EpendymalCell { is_producing_csf: true, cilia_beating: false });
        agent.microglia = Some(Microglia {
            state: MicrogliaState::Amoeboid,
            plaque_accumulation: 20.0,
            inflammatory_cytokines: 99.0,
            c4_overexpression: true,
            is_pro_inflammatory: true,
        });
        let mut plaques = 50.0;
        let mut volume = 0.0;
        let mut pressure = 19.9;
        let mut agents = vec![agent];
        GlialPipeline::new().process_all(&mut agents, GlialEnvironment {
            bhe_integrity: &mut 1.0,
            amyloid_plaques: &mut plaques,
            csf_volume: &mut volume,
            csf_pressure: &mut pressure,
            is_sleeping: false,
            drainage_blocked: true,
        });
        assert!(pressure <= 20.0);
        assert!(agents[0].microglia.as_ref().unwrap().inflammatory_cytokines <= 100.0);
    }

    #[test]
    fn astrocytes_cannot_create_atp_without_reserve_or_presence() {
        let neuron_without_astrocyte = neuron("neuron-no-astrocyte", 10.0);
        let mut neuron_with_empty_reserve = neuron("neuron-empty-astrocyte", 10.0);
        neuron_with_empty_reserve.astrocyte = Some(Astrocyte {
            glycogen_reserve: 0.0,
            is_reactive: false,
            protected_neurons: vec!["neuron-empty-astrocyte".to_string()],
        });
        let mut bhe = 1.0;
        let mut plaques = 0.0;
        let mut volume = 0.0;
        let mut pressure = 10.0;
        let mut agents = vec![neuron_without_astrocyte, neuron_with_empty_reserve];

        GlialPipeline::new().process_all(&mut agents, GlialEnvironment {
            bhe_integrity: &mut bhe,
            amyloid_plaques: &mut plaques,
            csf_volume: &mut volume,
            csf_pressure: &mut pressure,
            is_sleeping: false,
            drainage_blocked: false,
        });

        assert_eq!(agents[0].metabolism.atp_budget, 10.0);
        assert_eq!(agents[1].metabolism.atp_budget, 10.0);
    }
}
