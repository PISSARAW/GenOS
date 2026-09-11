use super::*;
use crate::neurobiology::{C3_PRUNING_THRESHOLD, CD47_PROTECTION_THRESHOLD};

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
        if let (Some(ns), Some(astro)) = (&mut agent.nervous_system, &mut agent.astrocyte) {
            let requested_support: f64 = if ctx.state.reactive_astrocytes.contains(&agent.cell_id) { 10.0 } else { 20.0 };
            let energy_support = requested_support.min(astro.glycogen_reserve.max(0.0));
            astro.glycogen_reserve -= energy_support;
            agent.metabolism.atp_budget += energy_support;

            // Synapse tripartite : les astrocytes protègent les épines dendritiques postsynaptiques
            if let Some(tree) = &mut ns.dendritic_tree {
                for comp in tree.compartments.iter_mut() {
                    for spine in comp.spines.iter_mut() {
                        spine.cd47_expression = (spine.cd47_expression + 0.1).min(2.0);
                    }
                }
            }
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
                    !(local_c3 > C3_PRUNING_THRESHOLD && synapse.cd47_expression < CD47_PROTECTION_THRESHOLD)
                });

                // Trogocytose microgliale postsynaptique : élagage des épines opsonisées par C3
                if let Some(tree) = &mut ns.dendritic_tree {
                    for comp in tree.compartments.iter_mut() {
                        comp.spines.retain(|spine| {
                            let local_c3 = spine.c3_opsonization
                                + if c4_over { 0.5 } else { 0.0 }
                                + if pro_inflam { 0.25 } else { 0.0 };
                            !(local_c3 > C3_PRUNING_THRESHOLD && spine.cd47_expression < CD47_PROTECTION_THRESHOLD)
                        });
                    }
                }
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
