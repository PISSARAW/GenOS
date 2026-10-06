use crate::cell::AgentCell;
use crate::neurobiology::NervousSystemLocation;

/// Cellules qui tapissent les ventricules (papier peint vivant)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EpendymalCell {
    pub is_producing_csf: bool, 
    pub cilia_beating: bool,    
}

impl Default for EpendymalCell {
    fn default() -> Self {
        Self {
            is_producing_csf: true,
            cilia_beating: true,
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

fn compute_csf_production(agents: &[AgentCell]) -> (f64, bool) {
    let mut total_production = 0.0;
    let mut active_cilia = false;
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
    (total_production, active_cilia)
}

fn update_csf_volume(volume: &mut f64, production: f64, drainage_blocked: bool) {
    *volume += production;
    if !drainage_blocked {
        let drainage = *volume * 0.1;
        *volume -= drainage;
    }
}

fn compute_csf_pressure(volume: &mut f64, pressure: &mut f64) -> bool {
    let optimal_volume = 150.0;
    *pressure = if *volume > optimal_volume {
        (*volume - optimal_volume) * 2.0
    } else {
        10.0
    };
    *volume < (optimal_volume * 0.5)
}

struct SleepCleaningParams<'a> {
    volume: f64,
    amyloid_plaques: &'a mut f64,
    is_sleeping: bool,
    active_cilia: bool,
    drainage_blocked: bool,
}

fn process_sleep_cleaning(params: SleepCleaningParams) {
    if params.is_sleeping && params.active_cilia && !params.drainage_blocked {
        let wash_power = params.volume * 0.05;
        *params.amyloid_plaques = (*params.amyloid_plaques - wash_power).max(0.0);
    }
}

fn apply_mechanical_effects(agents: &mut [AgentCell], pressure: f64, gravity_crush: bool) {
    for agent in agents.iter_mut() {
        if let Some(ref mut ns) = agent.nervous_system_mut() {
            if ns.location == NervousSystemLocation::Central {
                if pressure > 50.0 {
                    agent.metabolism.mitochondria.atp_budget = agent.metabolism.mitochondria.atp_budget.saturating_sub(pressure as u64);
                }
                if gravity_crush {
                    agent.metabolism.mitochondria.atp_budget = agent.metabolism.mitochondria.atp_budget.saturating_sub(30);
                }
            }
        }
    }
}

pub fn process_ependymal_cells(agents: &mut [AgentCell], env: CsfEnvironment) {
    let (total_production, active_cilia) = compute_csf_production(agents);
    update_csf_volume(env.volume, total_production, env.drainage_blocked);
    let gravity_crush = compute_csf_pressure(env.volume, env.pressure);
    process_sleep_cleaning(SleepCleaningParams {
    volume: *env.volume,
    amyloid_plaques: env.amyloid_plaques,
    is_sleeping: env.is_sleeping,
    active_cilia,
    drainage_blocked: env.drainage_blocked,
});
    apply_mechanical_effects(agents, *env.pressure, gravity_crush);
}