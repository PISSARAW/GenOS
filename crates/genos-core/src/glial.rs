use crate::cell::AgentCell;
use crate::neurobiology::{NervousSystemLocation, Myelinator, MicrogliaState};
use std::collections::HashMap;

pub fn process_astrocytes(agents: &mut [AgentCell], bhe_integrity: &mut f64) {
    let mut neurons_status: HashMap<String, bool> = HashMap::new();
    for agent in agents.iter() {
        if agent.nervous_system().is_some() {
            neurons_status.insert(agent.cell_id.to_string(), agent.metabolism.mitochondria.atp_budget > 0);
        }
    }
    let mut bhe_intact = false;
    for i in 0..agents.len() {
        if let Some(ref mut astro) = agents[i].astrocyte_mut() {
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
        if let Some(ref astro) = agent.astrocyte() {
            if astro.is_reactive { reactive_astrocytes.extend(astro.protected_neurons.clone()); }
        }
    }
    for agent in agents.iter_mut() {
        if agent.nervous_system().is_some() {
            if reactive_astrocytes.contains(&agent.cell_id.to_string()) {
                if let Some(ref mut ns) = agent.nervous_system_mut() { ns.axon.terminals.clear(); }
            } else {
                agent.metabolism.mitochondria.atp_budget = agent.metabolism.mitochondria.atp_budget.saturating_add(20);
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
        if let Some(ref mut myelinator) = agent.myelinator_mut() {
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
        let cell_id = agent.cell_id.to_string();
        if let Some(ref mut ns) = agent.nervous_system_mut() {
            
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
        if let Some(ref mut micro) = agent.microglia_mut() {
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
        let mut reduce_atp = false;
        if let Some(ref mut ns) = agent.nervous_system_mut() {
            if ns.location == crate::neurobiology::NervousSystemLocation::Central {
                if inflammation_surge > 0.0 {
                    reduce_atp = true;
                }
                if is_sleeping {
                    ns.axon.terminals.retain(|syn| syn.activity_history > 5);
                }
            }
        }
        if reduce_atp {
            agent.metabolism.mitochondria.atp_budget = agent.metabolism.mitochondria.atp_budget.saturating_sub(inflammation_surge as u64);
        }
    }
}

pub struct CsfEnvironment<'a> {
    pub volume: &'a mut f64,
    pub pressure: &'a mut f64,
    pub drainage_blocked: bool,
    pub amyloid_plaques: &'a mut f64,
    pub is_sleeping: bool,
}

pub fn process_ependymal_cells(agents: &mut [AgentCell], env: CsfEnvironment) {
    let mut total_production = 0.0;
    let mut active_cilia = false;

    // 1. Usine à eau et Rameurs
    for agent in agents.iter() {
        if let Some(ref ependymal) = agent.ependymal() {
            if ependymal.is_producing_csf {
                total_production += 1.0; 
            }
            if ependymal.cilia_beating {
                active_cilia = true; 
            }
        }
    }

    // 2. Gestion du volume de Liquide Céphalo-Rachidien (LCR)
    *env.volume += total_production;
    if !env.drainage_blocked {
        let drainage = *env.volume * 0.1; // 10% évacué par cycle
        *env.volume -= drainage;
    }

    // 3. Pression et Anti-gravité
    let optimal_volume = 150.0;
    *env.pressure = if *env.volume > optimal_volume {
        (*env.volume - optimal_volume) * 2.0 // Pression exponentielle (Hydrocéphalie)
    } else {
        10.0 // Pression de base
    };

    let gravity_crush = *env.volume < (optimal_volume * 0.5);

    // 4. Le Lave-vaisselle (Nettoyage pendant le sommeil grâce aux cils)
    if env.is_sleeping && active_cilia && !env.drainage_blocked {
        let wash_power = *env.volume * 0.05;
        *env.amyloid_plaques = (*env.amyloid_plaques - wash_power).max(0.0);
    }

    // 5. Conséquences Mécaniques
    for agent in agents.iter_mut() {
        if let Some(ref mut ns) = agent.nervous_system_mut() {
            if ns.location == NervousSystemLocation::Central {
                if *env.pressure > 50.0 {
                    // Hydrocéphalie : la pression écrase les neurones
                    agent.metabolism.mitochondria.atp_budget = agent.metabolism.mitochondria.atp_budget.saturating_sub(*env.pressure as u64);
                }
                if gravity_crush {
                    // Manque d'airbag/flottaison : écrasement sous le propre poids du cerveau (1.4kg -> 50g)
                    agent.metabolism.mitochondria.atp_budget = agent.metabolism.mitochondria.atp_budget.saturating_sub(30);
                }
            }
        }
    }
}



