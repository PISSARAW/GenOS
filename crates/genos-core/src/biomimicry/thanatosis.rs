//! Thanatosis mapped to defensive fake-death state.
//!
//! Biological mechanism: "Playing dead" (Thanatosis) to deceive predators that
//! only attack live/moving prey, causing them to lose interest.
//! GenOS mapping: When facing an aggressive adversarial attack (e.g., prompt injection
//! or API trap), instead of analyzing and fighting it (costing tokens), the agent
//! feigns a crash. It returns a fake 500 error or "System Halted" message,
//! forcing the attacker to drop the connection.

#[derive(Debug, Clone)]
pub struct ThanatosisState {
    pub agent_id: String,
    pub is_playing_dead: bool,
}

impl ThanatosisState {
    pub fn new(agent_id: String) -> Self {
        Self {
            agent_id,
            is_playing_dead: false,
        }
    }

    /// Triggers the fake death mechanism
    pub fn trigger_fake_death(&mut self, threat_source: &str) -> String {
        self.is_playing_dead = true;
        format!(
            "Threat detected from {}. Initiating Thanatosis. Emitting fake FATAL_ERROR...",
            threat_source
        )
    }

    /// Revives the agent once the threat has passed
    pub fn revive(&mut self) -> String {
        self.is_playing_dead = false;
        "Threat passed. Agent revived from Thanatosis. Resuming normal operations.".to_string()
    }
}
