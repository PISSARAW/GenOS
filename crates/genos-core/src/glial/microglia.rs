use serde::{Deserialize, Serialize};
use crate::cell::AgentCell;

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
    pub c4_overexpression: bool,   // Schizophrénie (Sur-élagage)
    pub is_pro_inflammatory: bool, // Autisme (Sous-élagage)
}

impl Default for Microglia {
    fn default() -> Self {
        Self {
            state: MicrogliaState::Sentinel,
            plaque_accumulation: 0.0,
            inflammatory_cytokines: 0.0,
            c4_overexpression: false,
            is_pro_inflammatory: false,
        }
    }
}

#[derive(Clone, Copy)]
struct MicrogliaFlags {
    c4_overexpression: bool,
    is_pro_inflammatory: bool,
}

fn drain_one_plaque(agent: &mut AgentCell, plaques: &mut f64, surge: &mut f64) -> MicrogliaFlags {
    match agent.microglia_mut() {
        None => MicrogliaFlags { c4_overexpression: false, is_pro_inflammatory: false },
        Some(micro) => {
            match *plaques > 0.0 {
                true => {
                    micro.state = MicrogliaState::Amoeboid;
                    *plaques -= 1.0;
                    micro.plaque_accumulation += 1.0;
                    match micro.plaque_accumulation > 10.0 {
                        true => {
                            micro.inflammatory_cytokines += 5.0;
                            *surge += micro.inflammatory_cytokines;
                        }
                        false => {},
                    }
                }
                false => {
                    micro.state = MicrogliaState::Sentinel;
                    micro.inflammatory_cytokines = 0.0;
                    micro.plaque_accumulation = 0.0;
                }
            }
            MicrogliaFlags {
                c4_overexpression: micro.c4_overexpression,
                is_pro_inflammatory: micro.is_pro_inflammatory,
            }
        }
    }
}

fn keep_synapse(c3: f64, cd47: f64, flags: &MicrogliaFlags) -> bool {
    match flags.is_pro_inflammatory {
        true => true,
        false => {
            let mut local = c3;
            match flags.c4_overexpression {
                true => local += 0.5,
                false => {},
            }
            match local > 0.5 {
                false => true,
                true => match cd47 < 0.5 {
                    true => false,
                    false => true,
                },
            }
        }
    }
}

fn prune_agent_synapses(agent: &mut AgentCell, flags: &MicrogliaFlags) {
    match agent.nervous_system_mut() {
        None => {},
        Some(ns) => match ns.location {
            crate::neurobiology::NervousSystemLocation::Central => {
                ns.axon.terminals.retain(|s| keep_synapse(s.c3_opsonization, s.cd47_expression, flags));
            }
            _ => {},
        },
    }
}

fn apply_inflammation_cost(agent: &mut AgentCell, surge: f64) {
    match surge > 0.0 {
        false => {},
        true => match agent.nervous_system().is_some() {
            false => {},
            true => {
                let budget = agent.metabolism.mitochondria.atp_budget;
                agent.metabolism.mitochondria.atp_budget = budget.saturating_sub(surge as u64);
            }
        },
    }
}

pub fn process_microglia(agents: &mut [AgentCell], amyloid_plaques: &mut f64, is_sleeping: bool) {
    let _ = is_sleeping;
    let mut inflammation_surge = 0.0;
    for i in 0..agents.len() {
        let flags = drain_one_plaque(&mut agents[i], amyloid_plaques, &mut inflammation_surge);
        prune_agent_synapses(&mut agents[i], &flags);
    }
    for agent in agents.iter_mut() {
        apply_inflammation_cost(agent, inflammation_surge);
    }
}