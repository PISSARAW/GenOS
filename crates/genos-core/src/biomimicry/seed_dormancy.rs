//! Seed Dormancy & Dispersal mapped to conditional agent suspension and scattering.
//!
//! Biological mechanism: Plants package their genetic material into seeds that remain
//! dormant in harsh conditions and only germinate when environmental conditions are optimal.
//! GenOS mapping: When compute budget is low or a task is blocked waiting for external
//! events, the agent serializes its state into a compressed "Seed". This seed is scattered
//! to cold storage. It only "germinates" (wakes up) when specific conditions are met.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SeedState {
    Active,
    Dormant,
    Germinating,
}

#[derive(Debug, Clone)]
pub struct SeedDormancy {
    pub agent_id: String,
    pub state: SeedState,
    pub germination_condition: String,
}

impl SeedDormancy {
    pub fn new(agent_id: String) -> Self {
        Self {
            agent_id,
            state: SeedState::Active,
            germination_condition: String::new(),
        }
    }

    /// Packs the agent into a dormant seed
    pub fn enter_dormancy(&mut self, condition: &str) -> String {
        self.state = SeedState::Dormant;
        self.germination_condition = condition.to_string();
        format!("Agent packed into a Seed. Entering Dormancy. Will germinate when: {}", condition)
    }

    /// Checks environment to trigger germination
    pub fn check_germination(&mut self, environment_status: &str) -> String {
        if self.state == SeedState::Dormant && environment_status == self.germination_condition {
            self.state = SeedState::Germinating;
            "Conditions optimal. Seed is germinating... Waking up agent.".to_string()
        } else if self.state == SeedState::Dormant {
            "Conditions harsh. Seed remains dormant in cold storage.".to_string()
        } else {
            "Seed is already active.".to_string()
        }
    }
}
