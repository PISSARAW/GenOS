//! Cellular senescence mapped to zombie-capsule detection.
//!
//! Biological mechanism: a senescent cell is not dead — it lives, consumes
//! resources, and secretes inflammatory factors (SASP) that degrade healthy
//! neighbors. Young organisms clear them via immunosurveillance; old ones
//! accumulate them. GenOS mapping: capsules that are alive, unproductive,
//! resource-holding and externally harmful are flagged as zombies; voluntary
//! dormancy (spores, rare specialists) is explicitly exempted.

/// Observed vitals of one capsule over an assessment window.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CapsuleVitals {
    /// Ticks with meaningful output (merged work, accepted artifacts).
    pub productive_ticks: u32,
    /// Ticks alive without any output.
    pub idle_ticks: u32,
    /// Resources consumed during the window (budget units).
    pub resources_consumed: u64,
    /// External harm caused to others: held locks blocking merges, stale
    /// pheromones misleading navigators, repeated alerts without action…
    pub negative_externalities: u32,
    /// True when idleness is deliberate (spore, rare specialist standby).
    pub intentional_dormancy: bool,
}

/// Thresholds defining the senescent classification.
#[derive(Debug, Clone, Copy)]
pub struct SenescenceThresholds {
    /// Idle ratio at or above which a capsule is considered unproductive.
    pub min_idle_ratio: f64,
    /// Minimum idle ticks before any verdict (avoid flagging young capsules).
    pub min_idle_ticks: u32,
}

impl Default for SenescenceThresholds {
    fn default() -> Self {
        SenescenceThresholds { min_idle_ratio: 0.9, min_idle_ticks: 50 }
    }
}

/// Verdict of an assessment.
#[derive(Debug, Clone, PartialEq)]
pub enum VitalState {
    /// Productive member of the fleet.
    Active,
    /// Deliberately idle by design; never a zombie.
    IntentionallyDormant,
    /// Zombie: alive, unproductive, consuming, possibly harming neighbors.
    Senescent {
        /// SASP score = external harm per consumed resource unit.
        sasp_score: f64,
        idle_ratio: f64,
    },
}

impl CapsuleVitals {
    pub fn idle_ratio(&self) -> f64 {
        let total = self.productive_ticks + self.idle_ticks;
        if total == 0 {
            1.0
        } else {
            self.idle_ticks as f64 / total as f64
        }
    }

    /// SASP analogue: harm emitted per unit of resource consumed. A capsule
    /// can be harmless yet senescent (pure drain) or harmful while barely
    /// consuming (toxic lock-holder) — both dimensions are kept separate.
    pub fn sasp_score(&self) -> f64 {
        self.negative_externalities as f64 / self.resources_consumed.max(1) as f64
    }

    pub fn classify(&self, thresholds: &SenescenceThresholds) -> VitalState {
        if self.intentional_dormancy {
            return VitalState::IntentionallyDormant;
        }
        let idle = self.idle_ratio();
        if idle >= thresholds.min_idle_ratio && self.idle_ticks >= thresholds.min_idle_ticks {
            VitalState::Senescent { sasp_score: self.sasp_score(), idle_ratio: idle }
        } else {
            VitalState::Active
        }
    }
}

/// Priority for senolytic campaigns: zombies that harm others first, pure
/// drains second. Higher value = cleaned earlier. Active/dormant → 0.
pub fn senolytic_priority(state: &VitalState) -> u32 {
    match state {
        VitalState::Senescent { sasp_score, .. } => {
            let harmful = (sasp_score * 100.0).round() as u32;
            1000 + harmful.min(999)
        }
        _ => 0,
    }
}

/// Fleet-level hygiene report.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HygieneReport {
    pub active: usize,
    pub intentionally_dormant: usize,
    pub senescent: Vec<String>,
}

/// Classify a whole fleet snapshot (id → vitals), listing zombie ids ordered
/// by senolytic priority descending.
pub fn fleet_hygiene<'a, I>(fleet: I) -> HygieneReport
where
    I: IntoIterator<Item = (&'a str, &'a CapsuleVitals)>,
{
    let mut report = HygieneReport::default();
    let mut zombies: Vec<(String, u32)> = Vec::new();
    for (id, vitals) in fleet {
        match vitals.classify(&SenescenceThresholds::default()) {
            VitalState::Active => report.active += 1,
            VitalState::IntentionallyDormant => report.intentionally_dormant += 1,
            VitalState::Senescent { .. } => {
                let priority =
                    senolytic_priority(&vitals.classify(&SenescenceThresholds::default()));
                zombies.push((id.to_string(), priority));
            }
        }
    }
    zombies.sort_by(|a, b| b.1.cmp(&a.1));
    report.senescent = zombies.into_iter().map(|(id, _)| id).collect();
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn productive_capsule_is_active() {
        let vitals = CapsuleVitals {
            productive_ticks: 80,
            idle_ticks: 10,
            resources_consumed: 100,
            negative_externalities: 0,
            intentional_dormancy: false,
        };
        assert_eq!(vitals.classify(&SenescenceThresholds::default()), VitalState::Active);
    }

    #[test]
    fn zombie_is_flagged_with_sasp_score() {
        let vitals = CapsuleVitals {
            productive_ticks: 2,
            idle_ticks: 98,
            resources_consumed: 200,
            negative_externalities: 10,
            intentional_dormancy: false,
        };
        match vitals.classify(&SenescenceThresholds::default()) {
            VitalState::Senescent { sasp_score, idle_ratio } => {
                assert!((sasp_score - 0.05).abs() < 1e-9);
                assert!((idle_ratio - 0.98).abs() < 1e-9);
            }
            other => panic!("expected senescent, got {other:?}"),
        }
    }

    #[test]
    fn voluntary_dormancy_is_exempt() {
        let spore = CapsuleVitals {
            productive_ticks: 0,
            idle_ticks: 500,
            resources_consumed: 5,
            negative_externalities: 0,
            intentional_dormancy: true,
        };
        assert_eq!(
            spore.classify(&SenescenceThresholds::default()),
            VitalState::IntentionallyDormant
        );
    }

    #[test]
    fn young_capsules_are_not_flagged_prematurely() {
        let young = CapsuleVitals {
            productive_ticks: 0,
            idle_ticks: 10,
            resources_consumed: 20,
            negative_externalities: 0,
            intentional_dormancy: false,
        };
        assert_eq!(young.classify(&SenescenceThresholds::default()), VitalState::Active);
    }

    #[test]
    fn harmful_zombies_are_prioritized_in_fleet_hygiene() {
        let toxic = CapsuleVitals {
            productive_ticks: 0,
            idle_ticks: 100,
            resources_consumed: 10,
            negative_externalities: 8,
            intentional_dormancy: false,
        };
        let quiet_drain = CapsuleVitals {
            productive_ticks: 1,
            idle_ticks: 99,
            resources_consumed: 50,
            negative_externalities: 1,
            intentional_dormancy: false,
        };
        let healthy = CapsuleVitals {
            productive_ticks: 90,
            idle_ticks: 5,
            resources_consumed: 40,
            negative_externalities: 0,
            intentional_dormancy: false,
        };
        let report = fleet_hygiene(vec![
            ("quiet", &quiet_drain),
            ("healthy", &healthy),
            ("toxic", &toxic),
        ]);
        assert_eq!(report.active, 1);
        assert_eq!(report.senescent, vec!["toxic".to_string(), "quiet".to_string()]);
        assert!(senolytic_priority(&toxic.classify(&SenescenceThresholds::default()))
            > senolytic_priority(&quiet_drain.classify(&SenescenceThresholds::default())));
    }
}
