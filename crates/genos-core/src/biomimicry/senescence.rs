//! Cellular Senescence mapped to zombie-process elimination.
//!
//! Biological mechanism: Cells stop dividing and enter senescence to prevent cancer,
//! eventually being cleared by the immune system.
//! GenOS mapping: Detecting agents that have been running for too long without
//! yielding results (zombies) and gracefully clearing them to free up the swarm budget.

#[derive(Debug, Clone)]
pub struct SenescenceMonitor {
    pub agent_id: String,
    pub epochs_active: usize,
    pub max_epochs: usize,
}

impl SenescenceMonitor {
    pub fn new(agent_id: String, max_epochs: usize) -> Self {
        Self {
            agent_id,
            epochs_active: 0,
            max_epochs,
        }
    }

    pub fn check_age(&mut self) -> String {
        self.epochs_active += 1;
        if self.epochs_active >= self.max_epochs {
            "Senescence triggered. Agent has reached its maximum lifespan and will be cleared."
                .to_string()
        } else {
            "Agent is healthy and within operational lifespan.".to_string()
        }
    }
}

/// Vital signs of a capsule, used by the senolytic assessment (`senescence assess`).
#[derive(Debug, Clone)]
pub struct CapsuleVitals {
    pub productive_ticks: u32,
    pub idle_ticks: u32,
    pub resources_consumed: u64,
    pub negative_externalities: u32,
    pub intentional_dormancy: bool,
}

/// Thresholds beyond which a capsule is classified as senescent.
#[derive(Debug, Clone, Copy)]
pub struct SenescenceThresholds {
    /// Maximum share of idle ticks over total ticks before suspicion.
    pub max_idle_ratio: f64,
    /// SASP (senescence-associated secretory phenotype) analog: externalities per 1k resources.
    pub max_externalities_per_kilo_resource: f64,
}

impl Default for SenescenceThresholds {
    fn default() -> Self {
        Self {
            max_idle_ratio: 0.7,
            max_externalities_per_kilo_resource: 1.0,
        }
    }
}

/// Outcome of the senolytic classification of a capsule.
#[derive(Debug, Clone, PartialEq)]
pub enum VitalState {
    Active,
    IntentionallyDormant,
    Senescent { sasp_score: f64, idle_ratio: f64 },
}

impl CapsuleVitals {
    pub fn classify(&self, thresholds: &SenescenceThresholds) -> VitalState {
        if self.intentional_dormancy {
            return VitalState::IntentionallyDormant;
        }
        let total = (self.productive_ticks + self.idle_ticks).max(1) as f64;
        let idle_ratio = self.idle_ticks as f64 / total;
        let sasp_score =
            (self.negative_externalities as f64 * 1000.0) / (self.resources_consumed.max(1) as f64);
        if idle_ratio > thresholds.max_idle_ratio
            || sasp_score > thresholds.max_externalities_per_kilo_resource
        {
            VitalState::Senescent {
                sasp_score,
                idle_ratio,
            }
        } else {
            VitalState::Active
        }
    }
}
