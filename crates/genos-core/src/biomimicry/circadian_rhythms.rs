//! Circadian Rhythms mapped to chronobiological operational cycles.
//!
//! Biological mechanism: Internal clocks dictate phases of high activity (day)
//! and maintenance/repair (night), governed by melatonin and light.
//! GenOS mapping: The agent swarm alternates between 'Diurnal' (high responsiveness,
//! heavy compute allocation) and 'Nocturnal' (garbage collection, index rebuilding,
//! hippocampal replay) phases based on local time or workload schedules.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CircadianPhase {
    Diurnal,   // Active serving
    Nocturnal, // Maintenance and consolidation
}

#[derive(Debug, Clone)]
pub struct CircadianClock {
    pub swarm_id: String,
    pub current_phase: CircadianPhase,
}

impl CircadianClock {
    pub fn new(swarm_id: String, initial_phase: CircadianPhase) -> Self {
        Self {
            swarm_id,
            current_phase: initial_phase,
        }
    }

    /// Toggles the phase
    pub fn toggle_phase(&mut self) -> CircadianPhase {
        self.current_phase = match self.current_phase {
            CircadianPhase::Diurnal => CircadianPhase::Nocturnal,
            CircadianPhase::Nocturnal => CircadianPhase::Diurnal,
        };
        self.current_phase.clone()
    }

    pub fn can_execute_heavy_maintenance(&self) -> bool {
        self.current_phase == CircadianPhase::Nocturnal
    }
}
