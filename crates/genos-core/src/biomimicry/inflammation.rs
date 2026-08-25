//! Inflammation & Fever mapped to systemic degraded modes.
//!
//! Biological mechanism: Fever raises body temperature to make the environment
//! hostile to pathogens, while inflammation restricts local blood flow to quarantine
//! infections. Both temporarily degrade baseline performance to ensure survival.
//! GenOS mapping: When a severe anomaly (e.g., prompt injection, erratic behavior)
//! is detected, the swarm triggers an "Inflammation" state. It restricts tool permissions
//! (quarantine) and imposes heavy rate limits (fever), naturally resolving over time.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InflammationState {
    Healthy,
    LocalInflammation,
    SystemicFever,
}

#[derive(Debug, Clone)]
pub struct InflammatoryResponse {
    pub swarm_id: String,
    pub state: InflammationState,
    pub severity: f64, // 0.0 to 1.0
}

impl InflammatoryResponse {
    pub fn new(swarm_id: String) -> Self {
        Self {
            swarm_id,
            state: InflammationState::Healthy,
            severity: 0.0,
        }
    }

    /// Triggers an inflammatory response based on threat severity
    pub fn trigger_response(&mut self, threat_level: f64) {
        self.severity = (self.severity + threat_level).clamp(0.0, 1.0);
        if self.severity > 0.8 {
            self.state = InflammationState::SystemicFever;
        } else if self.severity > 0.3 {
            self.state = InflammationState::LocalInflammation;
        } else {
            self.state = InflammationState::Healthy;
        }
    }

    /// Simulates natural resolution (cooling down)
    pub fn resolve_over_time(&mut self, recovery_rate: f64) {
        self.severity = (self.severity - recovery_rate).clamp(0.0, 1.0);
        if self.severity < 0.3 {
            self.state = InflammationState::Healthy;
        } else if self.severity < 0.8 {
            self.state = InflammationState::LocalInflammation;
        }
    }

    pub fn is_quarantined(&self) -> bool {
        self.state != InflammationState::Healthy
    }
}
