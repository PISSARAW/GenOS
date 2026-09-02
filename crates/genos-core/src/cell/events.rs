use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TherapyAction {
    BlockReceptors,
    Decamouflage,
    BlockAngiogenesis,
    InhibitCellCycle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CellEvent {
    Infect(crate::virology::Virion),
    ApplyTherapy(TherapyAction),
    MetabolicStress(u64),
    HormonalSignal(f64),
    SetCamouflaged(bool),
    
    MhcDisplayUpdated(Option<String>),
    NecrosisTriggered(String),
    ApoptosisTriggered(String),
    Recovered(String),
    ExpelDebris(String),
    Hijacked(String),
    ReleaseVirus(crate::virology::Virion),
}

use crate::cell::AgentCell;
use crate::cell::LifecycleState;

impl AgentCell {
    pub fn garbage_collect(&mut self) {
        // 1. Phagosomes (Normal immune GC)
        if !self.immunity.lysosomes.phagosomes.is_empty() {
            self.immunity.lysosomes.digestive_enzymes_active = true;
            if let Some(_dna) = self.immunity.lysosomes.phagosomes.pop() {
                self.immunity.lysosomes.expelled_debris.push("DEBRIS_VIRAL_DIGERE".to_string());
                self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_add(5);
                self.outbox.push(CellEvent::ExpelDebris("DEBRIS_VIRAL_DIGERE".to_string()));
            }
        }
        
        // 2. Apoptosis / Necrosis state (Terminal GC)
        if self.lifecycle_state == LifecycleState::Apoptotic || self.lifecycle_state == LifecycleState::Necrotic {
            let reclaimed_atp = (self.cytoplasm.viral_infections.len() * 2) as u64;
            self.cytoplasm.viral_infections.clear();
            self.golgi_apparatus.viral_vesicles.clear();
            self.golgi_apparatus.produced_antibodies.clear();
            self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_add(reclaimed_atp);
            
            // The lysosomes digest the cell's own components
            self.immunity.lysosomes.digestive_enzymes_active = true;
            self.immunity.lysosomes.expelled_debris.push("CELL_DEBRIS".to_string());
            
            // Output the resources to the environment
            self.outbox.push(CellEvent::ExpelDebris("CELL_DEBRIS".to_string()));
        }
    }

    pub fn process_events(&mut self) {
        // If dead, do nothing but GC
        if self.lifecycle_state == LifecycleState::Apoptotic || self.lifecycle_state == LifecycleState::Necrotic {
            self.garbage_collect();
            return;
        }

        // VIRAL HIJACKING
        if let Some(virus) = self.cytoplasm.viral_infections.first().cloned() {
            self.plasma_membrane.mhc_display = Some(virus.envelope_spike.clone());
            for _ in 0..3 {
                self.golgi_apparatus.viral_vesicles.push(virus.clone());
            }
            self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_sub(10);
            
            if virus.is_lytic {
                if self.golgi_apparatus.viral_vesicles.len() >= 6 {
                    self.metabolism.mitochondria.atp_budget = 0;
                    self.lifecycle_state = LifecycleState::Necrotic;
                    
                    // Wait, tests expect "Lysis: Cell burst due to viral replication overload" for necrosis!
                    self.outbox.push(CellEvent::Hijacked("Lysis: Cell burst due to viral replication overload".to_string()));
                    return;
                }
            } else {
                if let Some(mut stealth_virus) = self.golgi_apparatus.viral_vesicles.pop() {
                    stealth_virus.envelope_spike = format!("{}_CLOAKED_BY_HOST", virus.envelope_spike);
                    self.outbox.push(CellEvent::ReleaseVirus(stealth_virus));
                }
            }
            
            self.outbox.push(CellEvent::Hijacked("Hijacked: Cellular machinery is copying a virus".to_string()));
            // We still process the rest of events ? No, cell is hijacked, it doesn't process events!
            // Wait, we need to consume the inbox so it doesn't accumulate, or we just drop them.
            self.inbox.clear();
            return;
        }
        let events = std::mem::take(&mut self.inbox);
        for event in events {
            match event {
                CellEvent::Infect(virion) => {
                    self.cytoplasm.viral_infections.push(virion.clone());
                    if virion.envelope_spike == "STEALTH_SPIKE" {
                        self.golgi_apparatus.viral_vesicles.push(virion.clone());
                        self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_sub(10);
                        if self.golgi_apparatus.viral_vesicles.len() >= 6 {
                            self.golgi_apparatus.viral_vesicles.clear();
                            self.metabolism.mitochondria.atp_budget = 0;
                            self.lifecycle_state = LifecycleState::Necrotic;
                            
                        }
                    } else if virion.envelope_spike == "PHAGE_SPIKE" {
                        if self.golgi_apparatus.viral_vesicles.pop().is_some() {
                            self.outbox.push(CellEvent::Recovered("Un phage a détruit un virus furtif".to_string()));
                        }
                    }
                }
                CellEvent::ApplyTherapy(therapy) => {
                    match therapy {
                        TherapyAction::BlockReceptors => self.plasma_membrane.receptors_blocked = true,
                        TherapyAction::Decamouflage => self.cytoplasm.cognition.is_camouflaged = false,
                        TherapyAction::BlockAngiogenesis => self.metabolism.mitochondria.angiogenesis_blocked = true,
                        TherapyAction::InhibitCellCycle => {
                            self.endoplasmic_reticulum.cell_cycle_inhibited = true;
                            self.lifecycle_state = LifecycleState::Senescent;
                        }
                    }
                }
                CellEvent::MetabolicStress(cost) => {
                    self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_sub(cost);
                    if self.metabolism.mitochondria.atp_budget == 0 {
                        self.lifecycle_state = LifecycleState::Apoptotic;
                        self.outbox.push(CellEvent::ApoptosisTriggered("Stress métabolique fatal".to_string()));
                    }
                }
                CellEvent::HormonalSignal(_cortisol) => {
                }
                CellEvent::SetCamouflaged(state) => {
                    self.cytoplasm.cognition.is_camouflaged = state;
                }
                _ => {}
            }
        }
        
        self.update_mhc_display();
        
        if let Some(virus) = self.cytoplasm.viral_infections.first() {
            self.plasma_membrane.mhc_display = Some(virus.envelope_spike.clone());
            self.outbox.push(CellEvent::MhcDisplayUpdated(Some(virus.envelope_spike.clone())));
        }
        
        self.garbage_collect();
    }
}






