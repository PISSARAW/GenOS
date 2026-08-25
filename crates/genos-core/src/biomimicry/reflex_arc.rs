//! Reflex Arc mapped to fast-path cognitive bypass.
//!
//! Biological mechanism: A reflex arc bypasses the brain (conscious reasoning)
//! by routing sensory input directly through the spinal cord to motor neurons.
//! GenOS mapping: When an agent encounters known critical conditions (e.g.,
//! immediate threat, clear invariant violation), it executes a hardcoded
//! Reflex without consulting the heavy MCTS/LLM planner (System 1 vs System 2).

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SensoryStimulus {
    Thermal(u32), // e.g., CPU/Rate limit heat
    Nociceptive(String), // Pain/Error signal
    Tactile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MotorResponse {
    Withdraw, // Drop current task/connection immediately
    Freeze,   // Halt all IO
    Ignore,   // No reflex triggered (route to brain)
}

pub struct ReflexArc {
    pub nociceptive_threshold: usize,
    pub thermal_threshold: u32,
}

impl ReflexArc {
    pub fn new(nociceptive_threshold: usize, thermal_threshold: u32) -> Self {
        Self {
            nociceptive_threshold,
            thermal_threshold,
        }
    }

    /// Evaluates a stimulus on the fast-path. If it crosses the threshold,
    /// an immediate MotorResponse is triggered without consulting the planner.
    pub fn evaluate_fast_path(&self, stimulus: SensoryStimulus) -> MotorResponse {
        match stimulus {
            SensoryStimulus::Thermal(heat) if heat > self.thermal_threshold => {
                MotorResponse::Freeze
            }
            SensoryStimulus::Nociceptive(pain_signal) if pain_signal.len() > self.nociceptive_threshold => {
                MotorResponse::Withdraw
            }
            _ => MotorResponse::Ignore,
        }
    }
}
