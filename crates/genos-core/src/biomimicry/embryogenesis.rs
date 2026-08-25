//! Embryogenesis mapped to staged capsule bootstrapping.
//!
//! Biological mechanism: organisms develop in strict phases (cleavage,
//! blastulation, gastrulation, organogenesis). An error in an early stage
//! cascades, so progression is gated.
//! GenOS mapping: booting an agent is a state machine rather than an atomic
//! operation. Each phase verifies preconditions and constructs part of the
//! state before proceeding.

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EmbryoPhase {
    /// Initial identity definition (Cleavage).
    Identity,
    /// Motivations & Drives established (Blastulation).
    Drives,
    /// Tool and capability linking (Gastrulation).
    Tools,
    /// Memory structure instantiation (Organogenesis).
    Memory,
    /// Final environment exposure (Birth).
    WorldExposure,
}

impl EmbryoPhase {
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "identity" => Some(Self::Identity),
            "drives" => Some(Self::Drives),
            "tools" => Some(Self::Tools),
            "memory" => Some(Self::Memory),
            "world_exposure" => Some(Self::WorldExposure),
            _ => None,
        }
    }
    
    pub fn next(&self) -> Option<Self> {
        match self {
            Self::Identity => Some(Self::Drives),
            Self::Drives => Some(Self::Tools),
            Self::Tools => Some(Self::Memory),
            Self::Memory => Some(Self::WorldExposure),
            Self::WorldExposure => None,
        }
    }
}

pub struct Embryogenesis {
    pub agent_id: String,
    pub current_phase: EmbryoPhase,
}

impl Embryogenesis {
    pub fn new(agent_id: String) -> Self {
        Self {
            agent_id,
            current_phase: EmbryoPhase::Identity,
        }
    }

    /// Advance to the next developmental phase if preconditions are met.
    pub fn advance(&mut self, preconditions_met: bool) -> Result<EmbryoPhase, String> {
        if !preconditions_met {
            return Err(format!("Preconditions not met for phase {:?}", self.current_phase));
        }

        if let Some(next_phase) = self.current_phase.next() {
            self.current_phase = next_phase;
            Ok(next_phase)
        } else {
            Err("Agent is already fully developed (WorldExposure)".to_string())
        }
    }
}
