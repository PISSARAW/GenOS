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
    }

    #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
    pub enum NervousSystemLocation {
        Central,
        Peripheral,
    }

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

pub struct AstrocyteProcessor;

impl GlialProcessor for AstrocyteProcessor {
    fn collect(&self, agent: &mut GlialCell, ctx: &mut GlialContext) {
        if agent.nervous_system.is_some() {
            ctx.state
                .neurons_alive
                .insert(agent.cell_id.clone(), agent.metabolism.atp_budget > 0.0);
        }

        if let Some(astro) = &mut agent.astrocyte {
            ctx.state.bhe_intact = true;
            let emergency = astro
                .protected_neurons
                .iter()
                .any(|n| ctx.state.neurons_alive.get(n) == Some(&false));

            if emergency {
                astro.is_reactive = true;
            } else if astro.glycogen_reserve > 10.0 {
                astro.glycogen_reserve -= 5.0;
            }

            if astro.is_reactive {
                ctx.state
                    .reactive_astrocytes
                    .extend(astro.protected_neurons.clone());
            }
        }
    }

    fn aggregate(&self, state: &mut GlialAggregateState, env: &mut GlialEnvironment) {
        *env.bhe_integrity = if state.bhe_intact { 1.0 } else { 0.0 };
    }

    fn apply(&self, agent: &mut GlialCell, ctx: &GlialApplyContext) {
        if agent.nervous_system.is_some() {
            let energy_support = if ctx.state.reactive_astrocytes.contains(&agent.cell_id) { 10.0 } else { 20.0 };
            agent.metabolism.atp_budget += energy_support;
        }
    }
}

pub struct MicrogliaProcessor;

impl GlialProcessor for MicrogliaProcessor {
    fn collect(&self, agent: &mut GlialCell, ctx: &mut GlialContext) {
        let (mut pro_inflam, mut c4_over) = (false, false);

        if let Some(micro) = &mut agent.microglia {
            if *ctx.env.amyloid_plaques > 0.0 {
                micro.state = MicrogliaState::Amoeboid;
                *ctx.env.amyloid_plaques -= 1.0;
                micro.plaque_accumulation += 1.0;

                if micro.plaque_accumulation > 10.0 {
                    micro.inflammatory_cytokines = (micro.inflammatory_cytokines + 5.0).min(100.0);
                    ctx.state.inflammation_surge += micro.inflammatory_cytokines;
                }
            } else {
                micro.state = MicrogliaState::Sentinel;
                micro.inflammatory_cytokines *= 0.9;
                micro.plaque_accumulation = 0.0;
            }
            c4_over = micro.c4_overexpression;
            pro_inflam = micro.is_pro_inflammatory;
        }

        if let Some(ns) = &mut agent.nervous_system {
            if ns.location == NervousSystemLocation::Central {
                ns.axon.terminals.retain(|synapse| {
                    let local_c3 = synapse.c3_opsonization
                        + if c4_over { 0.5 } else { 0.0 }
                        + if pro_inflam { 0.25 } else { 0.0 };
                    !(local_c3 > 0.5 && synapse.cd47_expression < 0.5)
                });
            }
        }
    }

    fn apply(&self, agent: &mut GlialCell, ctx: &GlialApplyContext) {
        if ctx.state.inflammation_surge > 0.0 && agent.nervous_system.is_some() {
            agent.metabolism.atp_budget = (agent.metabolism.atp_budget - ctx.state.inflammation_surge).max(0.0);
        }
    }
}

pub struct EpendymalProcessor;

impl GlialProcessor for EpendymalProcessor {
    fn collect(&self, agent: &mut GlialCell, ctx: &mut GlialContext) {
        if let Some(ependymal) = &agent.ependymal {
            if ependymal.is_producing_csf {
                ctx.state.csf_production += 1.0;
            }
            if ependymal.cilia_beating {
                ctx.state.active_cilia = true;
            }
        }
    }

    fn aggregate(&self, state: &mut GlialAggregateState, env: &mut GlialEnvironment) {
        if state.active_cilia && !env.drainage_blocked {
            let clearance = if env.is_sleeping { 2.0 } else { 0.5 };
            *env.amyloid_plaques = (*env.amyloid_plaques - clearance).max(0.0);
        }
        *env.csf_volume += state.csf_production;
        if !state.active_cilia || env.drainage_blocked {
            *env.csf_pressure = (*env.csf_pressure + state.csf_production * 0.5).min(20.0);
        } else {
            *env.csf_pressure = (*env.csf_pressure - state.csf_production * 0.1).max(5.0);
        }
    }

    fn apply(&self, _agent: &mut GlialCell, _ctx: &GlialApplyContext) {}
}

pub struct MyelinatorProcessor;

impl GlialProcessor for MyelinatorProcessor {
    fn collect(&self, agent: &mut GlialCell, ctx: &mut GlialContext) {
        if let Some(myelinator) = &agent.myelinator {
            match myelinator {
                Myelinator::Oligodendrocyte {
                    connected_axons,
                    is_damaged,
                } => {
                    if *is_damaged {
                        ctx.state.nogo_targets.extend(connected_axons.clone());
                    } else {
                        ctx.state
                            .healthy_oligo_targets
                            .extend(connected_axons.clone());
                    }
                }
                Myelinator::SchwannCell {
                    target_axon,
                    is_damaged,
                    forming_regeneration_tube,
                } => {
                    if !*is_damaged {
                        ctx.state
                            .healthy_schwann_targets
                            .push(target_axon.clone());
                        if *forming_regeneration_tube {
                            ctx.state
                                .repairing_schwann_targets
                                .push(target_axon.clone());
                        }
                    }
                }
            }
        }
    }

    fn apply(&self, agent: &mut GlialCell, ctx: &GlialApplyContext) {
        if let Some(ns) = &mut agent.nervous_system {
            let id = &agent.cell_id;

            if ctx.state.healthy_oligo_targets.contains(id)
                || ctx.state.healthy_schwann_targets.contains(id)
            {
                ns.axon.myelination_level = (ns.axon.myelination_level + 0.1).min(1.0);
            }

            if ctx.state.nogo_targets.contains(id) && ns.location == NervousSystemLocation::Central {
                ns.axon.nogo_inhibited = true;
            }

            if ctx.state.repairing_schwann_targets.contains(id)
                && ns.location == NervousSystemLocation::Peripheral
            {
                ns.axon.is_severed = false;
                ns.axon.nogo_inhibited = false;
            }
        }
    }
}

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
