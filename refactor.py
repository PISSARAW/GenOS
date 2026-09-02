import sys

with open('crates/genos-core/src/orchestrator/methods.rs', 'r', encoding='utf-8') as f:
    content = f.read()

start_sig = 'pub fn tick(&mut self, agent: &mut AgentCell, action_string: &str) -> TickResult {'
start_idx = content.find(start_sig)
end_sig = 'pub fn process_synaptic_cleft(&mut self, agents: &mut [crate::cell::AgentCell]) {'
end_idx = content.find(end_sig)

if start_idx == -1 or end_idx == -1:
    print('Failed to find markers')
    sys.exit(1)

new_tick = '''pub fn tick(&mut self, agent: &mut AgentCell, action_string: &str) -> TickResult {
        // Option B : Event Bus (DIP + Actor Model)
        
        use crate::cell::events::{CellEvent, TherapyAction};

        let cortisol = self.endocrine_system.corticosteroid_level;
        agent.inbox.push(CellEvent::HormonalSignal(cortisol));
        
        let mut metabolic_cost = 1;
        if self.immune_system.il6_level >= 10.0 && !self.immune_system.il6_receptors_blocked {
            metabolic_cost = 5; 
        }
        if action_string == "REPLICATE" {
            metabolic_cost = 20;
        }
        agent.inbox.push(CellEvent::MetabolicStress(metabolic_cost));

        if let Some(ref _active_therapies) = agent.cytoplasm.cognition.epigenetic_drives.get("ActiveTherapies") {
            agent.inbox.push(CellEvent::ApplyTherapy(TherapyAction::BlockReceptors));
        }

        if let Some(rule) = &self.apoptosis_rule {
            if !agent.cytoplasm.cognition.is_camouflaged {
                if rule.evaluate(&agent.cytoplasm.cognition.epigenetic_drives) {
                    agent.inbox.push(CellEvent::ApplyTherapy(TherapyAction::InhibitCellCycle));
                    return TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string());
                }
            }
        }

        // --- THE CELL PROCESSES ITS OWN STATE IN ISOLATION ---
        agent.process_events();

        // --- ORCHESTRATOR COLLECTS RESULTS ---
        let outbox = std::mem::take(&mut agent.outbox);
        for event in outbox {
            match event {
                CellEvent::NecrosisTriggered(reason) => return TickResult::Necrosis(reason),
                CellEvent::ApoptosisTriggered(_reason) => return TickResult::Apoptosis,
                CellEvent::Recovered(reason) => return TickResult::Recovered(reason),
                CellEvent::MhcDisplayUpdated(Some(spike)) => {
                    if spike.contains("_CLOAKED_BY_HOST") {
                        // Special Orchestrator handling
                    }
                }
                _ => {}
            }
        }
        
        // Trace logging
        agent.cytoplasm.trace.sequence.push(action_string.to_string());
        
        // Exocytosis Nervous System
        if let Some(nervous_system) = &mut agent.nervous_system {
            if let Some(outputs) = nervous_system.process_soma() {
                for (target_id, transmitter, amount) in outputs {
                    self.nervous_system.synaptic_cleft.push(CleftMessage {
                        source_id: agent.cell_id.to_string(),
                        target_id,
                        transmitter,
                        amount,
                        ticks_in_cleft: 0,
                    });
                }
            }
            nervous_system.apply_neuroplasticity();
        }
        
        if agent.metabolism.mitochondria.atp_budget == 0 {
             return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }

        TickResult::Continue
    }

    /// LA FENTE SYNAPTIQUE ET LA RECAPTURE (Le passage du message entre les neurones)
    '''

new_content = content[:start_idx] + new_tick + content[end_idx + len(end_sig):]

with open('crates/genos-core/src/orchestrator/methods.rs', 'w', encoding='utf-8') as f:
    f.write(new_content)

'''
