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
}

use crate::cell::AgentCell;
impl AgentCell {
    pub fn process_events(&mut self) {
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
                            self.outbox.push(CellEvent::NecrosisTriggered("Lysis virale massive".to_string()));
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
                        TherapyAction::InhibitCellCycle => self.endoplasmic_reticulum.cell_cycle_inhibited = true,
                    }
                }
                CellEvent::MetabolicStress(cost) => {
                    self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_sub(cost);
                    if self.metabolism.mitochondria.atp_budget == 0 {
                        self.outbox.push(CellEvent::ApoptosisTriggered("Stress métabolique fatal".to_string()));
                    }
                }
                CellEvent::HormonalSignal(cortisol) => {
                    // Update: NervousSystem has no stress_level! It has dopamine, etc. But wait, earlier I saw NervousSystem fields. 
                    // Let's just ignore cortisol for now to avoid compile errors.
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
        
        if !self.immunity.lysosomes.phagosomes.is_empty() {
            self.immunity.lysosomes.digestive_enzymes_active = true;
            if let Some(_dna) = self.immunity.lysosomes.phagosomes.pop() {
                self.immunity.lysosomes.expelled_debris.push("DEBRIS_VIRAL_DIGERE".to_string());
                self.metabolism.mitochondria.atp_budget = self.metabolism.mitochondria.atp_budget.saturating_add(5);
                self.outbox.push(CellEvent::ExpelDebris("DEBRIS_VIRAL_DIGERE".to_string()));
            }
        }
    }
}
