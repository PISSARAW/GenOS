use crate::cell::AgentCell;
use crate::neurobiology::{NervousSystemLocation, Myelinator};

#[derive(Default)]
struct MyelinTargets {
    healthy_oligo: Vec<String>,
    nogo: Vec<String>,
    healthy_schwann: Vec<String>,
    repairing_schwann: Vec<String>,
}

fn collect_oligo_targets(targets: &mut MyelinTargets, connected: &[String], damaged: bool) {
    match damaged {
        true => targets.nogo.extend(connected.to_vec()),
        false => targets.healthy_oligo.extend(connected.to_vec()),
    }
}

struct SchwannData<'a> {
    axon: &'a str,
    damaged: bool,
    tube: &'a mut bool,
}

impl<'a> SchwannData<'a> {
    fn new(axon: &'a str, damaged: bool, tube: &'a mut bool) -> Self {
        Self { axon, damaged, tube }
    }
}

fn collect_schwann_targets(targets: &mut MyelinTargets, data: SchwannData) {
    match data.damaged {
        true => *data.tube = false,
        false => {
            targets.healthy_schwann.push(data.axon.to_string());
            *data.tube = true;
            targets.repairing_schwann.push(data.axon.to_string());
        }
    }
}

fn collect_myelin_targets(agents: &mut [AgentCell]) -> MyelinTargets {
    let mut targets = MyelinTargets::default();
    for agent in agents.iter_mut() {
        match agent.myelinator_mut() {
            None => {},
            Some(myelinator) => match myelinator {
                Myelinator::Oligodendrocyte { connected_axons, is_damaged } => {
                    collect_oligo_targets(&mut targets, &connected_axons.clone(), *is_damaged);
                }
                Myelinator::SchwannCell { target_axon, is_damaged, forming_regeneration_tube } => {
                    collect_schwann_targets(&mut targets, SchwannData::new(&target_axon, *is_damaged, forming_regeneration_tube));
                }
            },
        }
    }
    targets
}

fn is_supported(cell_id: &str, targets: &MyelinTargets) -> bool {
    match targets.healthy_oligo.contains(&cell_id.to_string()) {
        true => true,
        false => targets.healthy_schwann.contains(&cell_id.to_string()),
    }
}

fn apply_severed_repair(agent: &mut AgentCell, cell_id: &str, targets: &MyelinTargets) {
    let Some(ns) = agent.nervous_system_mut() else {
        return;
    };
    match ns.axon.is_severed {
        false => {},
        true => match ns.location {
            NervousSystemLocation::Central => apply_central_block(ns, cell_id, targets),
            NervousSystemLocation::Peripheral => apply_peripheral_repair(ns, cell_id, targets),
        },
    }
}

fn apply_central_block(ns: &mut crate::neurobiology::NervousSystem, cell_id: &str, targets: &MyelinTargets) {
    match targets.nogo.contains(&cell_id.to_string()) {
        true => ns.axon.nogo_inhibited = true,
        false => match targets.healthy_oligo.contains(&cell_id.to_string()) {
            true => ns.axon.nogo_inhibited = true,
            false => {},
        },
    }
}

fn apply_peripheral_repair(ns: &mut crate::neurobiology::NervousSystem, cell_id: &str, targets: &MyelinTargets) {
    match targets.repairing_schwann.contains(&cell_id.to_string()) {
        false => {},
        true => match ns.axon.nogo_inhibited {
            true => {},
            false => ns.axon.is_severed = false,
        },
    }
}

fn apply_myelin_to_agent(agent: &mut AgentCell, targets: &MyelinTargets) {
    let cell_id = agent.cell_id.to_string();
    match agent.nervous_system_mut() {
        None => {},
        Some(ns) => match is_supported(&cell_id, targets) {
            true => ns.axon.myelination_level = 1.0,
            false => ns.axon.myelination_level *= 0.9,
        },
    }
    apply_severed_repair(agent, &cell_id, targets);
}

pub fn process_myelinators(agents: &mut [AgentCell]) {
    let targets = collect_myelin_targets(agents);
    for agent in agents.iter_mut() {
        apply_myelin_to_agent(agent, &targets);
    }
}