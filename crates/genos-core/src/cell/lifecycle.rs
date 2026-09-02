use serde::{Deserialize, Serialize};

pub trait LifecycleBehavior {
    /// Processus de l'état actuel. Retourne Some(NouveauEtat) si une transition doit avoir lieu.
    fn process(&mut self, cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState>;
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct StemCellState {
    pub time_in_state: u64,
}

impl LifecycleBehavior for StemCellState {
    fn process(&mut self, _cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState> {
        self.time_in_state += 1;
        None
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct ProliferatingState {
    pub division_progress: f64,
}

impl LifecycleBehavior for ProliferatingState {
    fn process(&mut self, _cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState> {
        None
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct DifferentiatedState {
    pub age: u64,
}

impl LifecycleBehavior for DifferentiatedState {
    fn process(&mut self, cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState> {
        self.age += 1;
        
        if self.age > 1000 {
            return Some(crate::cell::LifecycleState::Senescent(SenescentState::default()));
        }
        
        if cell.metabolism.mitochondria.atp_budget == 0 {
            return Some(crate::cell::LifecycleState::Necrotic(NecroticState::default()));
        }
        
        None
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct SenescentState {
    pub time_senescent: u64,
}

impl LifecycleBehavior for SenescentState {
    fn process(&mut self, _cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState> {
        self.time_senescent += 1;
        if self.time_senescent > 200 {
            return Some(crate::cell::LifecycleState::Apoptotic(ApoptoticState::default()));
        }
        None
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct ApoptoticState {
    pub disassembly_progress: f64,
}

impl LifecycleBehavior for ApoptoticState {
    fn process(&mut self, _cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState> {
        self.disassembly_progress += 0.1;
        None
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct NecroticState {
    pub decay_progress: f64,
}

impl LifecycleBehavior for NecroticState {
    fn process(&mut self, _cell: &mut crate::cell::AgentCell) -> Option<crate::cell::LifecycleState> {
        self.decay_progress += 0.1;
        None
    }
}
