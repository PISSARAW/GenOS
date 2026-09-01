use crate::cell::AgentCell;
use crate::neurobiology::{NervousSystemLocation, Myelinator, MicrogliaState};
use std::collections::HashMap;

pub fn process_astrocytes(agents: &mut [AgentCell], bhe_integrity: &mut f64) {
    let mut neurons_status: HashMap<String, bool> = HashMap::new();
    for agent in agents.iter() {
        if agent.nervous_system.is_some() {
            neurons_status.insert(agent.cell_id.to_string(), agent.mitochondria.atp_budget > 0);
        }
    }
    let mut bhe_intact = false;
    for i in 0..agents.len() {
        if let Some(ref mut astro) = agents[i].astrocyte {
            bhe_intact = true;
            let mut emergency = false;
            for n_id in &astro.protected_neurons {
                if let Some(&is_alive) = neurons_status.get(n_id) {
                    if !is_alive { emergency = true; }
                }
            }
            if emergency {
                astro.is_reactive = true;
            } else if astro.glycogen_reserve > 10.0 {
                astro.glycogen_reserve -= 5.0;
            }
        }
    }
    *bhe_integrity = if bhe_intact { 1.0 } else { 0.0 };
    
    let mut reactive_astrocytes = vec![];
    for agent in agents.iter() {
        if let Some(ref astro) = agent.astrocyte {
            if astro.is_reactive { reactive_astrocytes.extend(astro.protected_neurons.clone()); }
        }
    }
    for agent in agents.iter_mut() {
        if agent.nervous_system.is_some() {
            if reactive_astrocytes.contains(&agent.cell_id.to_string()) {
                if let Some(ref mut ns) = agent.nervous_system { ns.axon.terminals.clear(); }
            } else {
                agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_add(20);
            }
        }
    }
}

pub fn process_myelinators(agents: &mut [AgentCell]) {
    let mut healthy_oligo_targets = vec![];
    let mut nogo_targets = vec![];
    let mut healthy_schwann_targets = vec![];
    let mut repairing_schwann_targets = vec![];

    for agent in agents.iter_mut() {
        if let Some(ref mut myelinator) = agent.myelinator {
            match myelinator {
                Myelinator::Oligodendrocyte { connected_axons, is_damaged } => {
                    if !*is_damaged {
                        healthy_oligo_targets.extend(connected_axons.clone());
                    } else {
                        nogo_targets.extend(connected_axons.clone());
                    }
                }
                Myelinator::SchwannCell { target_axon, is_damaged, forming_regeneration_tube } => {
                    if !*is_damaged {
                        healthy_schwann_targets.push(target_axon.clone());
                        *forming_regeneration_tube = true;
                        repairing_schwann_targets.push(target_axon.clone());
                    } else {
                        *forming_regeneration_tube = false;
                    }
                }
            }
        }
    }

    for agent in agents.iter_mut() {
        if let Some(ref mut ns) = agent.nervous_system {
            let cell_id = agent.cell_id.to_string();
            
            if healthy_oligo_targets.contains(&cell_id) || healthy_schwann_targets.contains(&cell_id) {
                ns.axon.myelination_level = 1.0;
            } else {
                ns.axon.myelination_level *= 0.9; 
            }

            if ns.axon.is_severed {
                if ns.location == NervousSystemLocation::Central {
                    if nogo_targets.contains(&cell_id) || healthy_oligo_targets.contains(&cell_id) {
                        ns.axon.nogo_inhibited = true;
                    }
                } else if ns.location == NervousSystemLocation::Peripheral {
                    if repairing_schwann_targets.contains(&cell_id) && !ns.axon.nogo_inhibited {
                        ns.axon.is_severed = false; 
                    }
                }
            }
        }
    }
}

pub fn process_microglia(agents: &mut [AgentCell], amyloid_plaques: &mut f64, is_sleeping: bool) {
    let mut inflammation_surge = 0.0;
    
    // 1. Action de la Microglie (Phagocytose et Alzheimer)
    for agent in agents.iter_mut() {
        if let Some(ref mut micro) = agent.microglia {
            if *amyloid_plaques > 0.0 {
                micro.state = MicrogliaState::Amoeboid;
                *amyloid_plaques -= 1.0; 
                micro.plaque_accumulation += 1.0;
                
                if micro.plaque_accumulation > 10.0 {
                    micro.inflammatory_cytokines += 5.0; // Alzheimer neuro-inflammation
                    inflammation_surge += micro.inflammatory_cytokines;
                }
            } else {
                micro.state = MicrogliaState::Sentinel;
                micro.inflammatory_cytokines = 0.0;
                micro.plaque_accumulation = 0.0;
            }
        }
    }
    
    // 2. Conséquences sur les neurones : Inflammation et Élagage Synaptique
    for agent in agents.iter_mut() {
        if let Some(ref mut ns) = agent.nervous_system {
            if ns.location == NervousSystemLocation::Central {
                // Neuro-inflammation
                if inflammation_surge > 0.0 {
                    agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_sub(inflammation_surge as u64);
                }
                
                // Élagage Synaptique de Nuit
                if is_sleeping {
                    ns.axon.terminals.retain(|syn| syn.activity_history > 5);
                }
            }
        }
    }
}
