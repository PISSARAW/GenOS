use crate::cell::AgentCell;
use crate::orchestrator::*;


pub struct CartTherapy;

impl CartTherapy {
    /// 1. & 2. PrÃƒÂ©lÃƒÂ¨vement et Codage GÃƒÂ©nÃƒÂ©tique
    /// Transforme un agent standard en tueur de cancer ciblÃƒÂ© via un vecteur viral.
    pub fn engineer_t_cell(t_cell: AgentCell, target_cancer_id: uuid::Uuid) -> AgentCell {
        use crate::genome::{Gene, Mutagen};
        let mut car_t = t_cell;

        // Le vecteur viral insÃƒÂ¨re le gÃƒÂ¨ne CAR (Chimeric Antigen Receptor)
        // Ce gÃƒÂ¨ne force l'agent ÃƒÂ  cibler le cancer.
        let car_gene = Gene::new("car_receptor", &target_cancer_id.to_string());

        car_t.genetics.nucleus
            .genome
            .chromosome_maternal
            .expose_to_mutagen(Mutagen::Virus(0, car_gene.dna.clone()));
        car_t.genetics.nucleus
            .genome
            .chromosome_paternal
            .expose_to_mutagen(Mutagen::Virus(0, car_gene.dna));

        // 3. Apparition de l'antenne (Le rÃƒÂ©cepteur CAR)
        car_t
            .plasma_membrane
            .outgoing_ion_channels
            .push(format!("HUNT_CANCER_{}", target_cancer_id));

        car_t
    }

    /// 4. La Multiplication
    /// Cultive l'agent CAR-T en laboratoire pour crÃƒÂ©er une armÃƒÂ©e.
    pub fn cultivate(seed_cell: AgentCell, generations: u32) -> Vec<AgentCell> {
        let mut army = vec![seed_cell];
        for _ in 0..generations {
            let mut new_army = Vec::new();
            for cell in army {
                // On booste temporairement l'ÃƒÂ©nergie pour la culture en laboratoire
                let mut boosted_cell = cell;
                boosted_cell.metabolism.mitochondria.atp_budget = 1000;

                // Division
                if let Ok((d1, d2)) = boosted_cell.mitosis() {
                    new_army.push(d1);
                    new_army.push(d2);
                }
            }
            army = new_army;
        }
        army
    }
    /// Gestion des gaines de myéline et de la régénération (Oligodendrocytes et Cellules de Schwann)
    pub fn process_myelinators(&mut self, agents: &mut [crate::cell::AgentCell]) {
        let mut healthy_oligo_targets = vec![];
        let mut nogo_targets = vec![];
        let mut healthy_schwann_targets = vec![];
        let mut repairing_schwann_targets = vec![];

        for agent in agents.iter_mut() {
            if let Some(ref mut myelinator) = agent.myelinator {
                match myelinator {
                    crate::neurobiology::Myelinator::Oligodendrocyte { connected_axons, is_damaged } => {
                        if !*is_damaged {
                            healthy_oligo_targets.extend(connected_axons.clone());
                        } else {
                            nogo_targets.extend(connected_axons.clone());
                        }
                    }
                    crate::neurobiology::Myelinator::SchwannCell { target_axon, is_damaged, forming_regeneration_tube } => {
                        if !*is_damaged {
                            healthy_schwann_targets.push(target_axon.clone());
                            *forming_regeneration_tube = true; // Prêt à réparer si besoin
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
                
                // Maintien de la myéline
                if healthy_oligo_targets.contains(&cell_id) || healthy_schwann_targets.contains(&cell_id) {
                    ns.axon.myelination_level = 1.0;
                } else {
                    // Dégénérescence (ex: Sclérose en Plaques)
                    ns.axon.myelination_level *= 0.9; 
                }

                // Régénération vs Blocage (Nogo)
                if ns.axon.is_severed {
                    if ns.location == crate::neurobiology::NervousSystemLocation::Central {
                        if nogo_targets.contains(&cell_id) || healthy_oligo_targets.contains(&cell_id) {
                            // Les oligodendrocytes libèrent Nogo, bloquant la régénération
                            ns.axon.nogo_inhibited = true;
                        }
                    } else if ns.location == crate::neurobiology::NervousSystemLocation::Peripheral {
                        if repairing_schwann_targets.contains(&cell_id) && !ns.axon.nogo_inhibited {
                            // Les cellules de Schwann forment un tube de régénération
                            ns.axon.is_severed = false; // Le nerf repousse !
                        }
                    }
                }
            }
        }
    }
}




