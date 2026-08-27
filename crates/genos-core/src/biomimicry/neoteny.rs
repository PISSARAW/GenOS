//! Neoteny mapped to fleet-level conservation of juvenile plasticity.
//!
//! Biological mechanism: the axolotl keeps larval traits its whole life;
//! humans extend their plastic periods. Neotenic populations trade peak
//! specialization for continuous adaptability — the trait pool that survives
//! environmental shifts. GenOS mapping: every fleet reserves a demographic
//! fraction of "neotenic" agents whose proceduralization is deferred and
//! whose play/exploration budgets are protected; specialization requests are
//! gated by the quota so mature fleets never lose their explorers entirely.

/// Juvenile traits a neotenic agent keeps deliberately open.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NeotenicTraits {
    /// Play budget is protected from AMPK reallocation (except famine).
    pub play_budget_protected: bool,
    /// Cerebellar compilation is refused even when readiness gates pass.
    pub proceduralization_deferred: bool,
    /// Epigenetic triggers stay wide-open (high plasticity).
    pub epigenetic_openness: bool,
}

impl NeotenicTraits {
    pub const CANONICAL: Self = Self {
        play_budget_protected: true,
        proceduralization_deferred: true,
        epigenetic_openness: true,
    };
}

/// What kind of agent a spawn request wants to create.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpawnRequest {
    /// Another explorer/neotenic individual — always allowed.
    Neotenic,
    /// A specialized adult — allowed only above the quota floor.
    Specialist,
}

/// Verdict for a spawn request under quota pressure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpawnDecision {
    Allowed { as_neotenic: bool },
    Deferred { reason: &'static str },
}

/// Demographic policy holding the reserved fraction φ_neo.
#[derive(Debug, Clone, Copy)]
pub struct NeotenyPolicy {
    /// Reserved fraction of the fleet kept neotenic, in [0,1].
    pub fraction: f64,
}

impl NeotenyPolicy {
    /// Fraction is clamped to a sane band: a fleet without any reserve loses
    /// adaptability, one fully neotenic never specializes.
    pub fn new(fraction: f64) -> Self {
        NeotenyPolicy {
            fraction: fraction.clamp(0.05, 0.5),
        }
    }

    fn required_floor(&self, total: usize) -> usize {
        ((total + 1) as f64 * self.fraction).floor() as usize
    }

    /// Decide a spawn against the current census. The floor uses total+1 so
    /// the very first spawn of an empty fleet can be neotenic.
    pub fn decide_spawn(
        &self,
        total_agents: usize,
        neotenic_agents: usize,
        request: SpawnRequest,
    ) -> SpawnDecision {
        match request {
            SpawnRequest::Neotenic => SpawnDecision::Allowed { as_neotenic: true },
            SpawnRequest::Specialist => {
                let after_spawn_total = total_agents + 1;
                let floor = self.required_floor(after_spawn_total);
                if neotenic_agents >= floor {
                    SpawnDecision::Allowed { as_neotenic: false }
                } else {
                    SpawnDecision::Deferred {
                        reason: "specialist spawn would breach the neotenic reserve; \
                                 convert this spawn to neotenic or retire a specialist"
                            .into(),
                    }
                }
            }
        }
    }

    /// Health metric: current reserve coverage ratio vs target.
    pub fn coverage(&self, total_agents: usize, neotenic_agents: usize) -> f64 {
        if total_agents == 0 {
            return self.fraction;
        }
        (neotenic_agents as f64 / total_agents as f64).min(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fraction_is_clamped_to_sane_band() {
        assert_eq!(NeotenyPolicy::new(0.9).fraction, 0.5);
        assert_eq!(NeotenyPolicy::new(0.01).fraction, 0.05);
    }

    #[test]
    fn neotenic_spawns_are_always_allowed() {
        let policy = NeotenyPolicy::new(0.2);
        assert_eq!(
            policy.decide_spawn(10, 2, SpawnRequest::Neotenic),
            SpawnDecision::Allowed { as_neotenic: true }
        );
    }

    #[test]
    fn specialist_is_converted_when_reserve_is_below_floor() {
        let policy = NeotenyPolicy::new(0.2);
        // Floor for 11 agents = 2; only 1 neotenic → specialist deferred.
        let verdict = policy.decide_spawn(10, 1, SpawnRequest::Specialist);
        assert!(matches!(verdict, SpawnDecision::Deferred { .. }));
        // With 2 already neotenic, the specialist is fine.
        assert_eq!(
            policy.decide_spawn(10, 2, SpawnRequest::Specialist),
            SpawnDecision::Allowed { as_neotenic: false }
        );
    }

    #[test]
    fn coverage_reports_reserve_health() {
        let policy = NeotenyPolicy::new(0.25);
        assert!((policy.coverage(8, 2) - 0.25).abs() < 1e-9);
        assert_eq!(policy.coverage(8, 8), 1.0);
        assert_eq!(policy.coverage(0, 0), 0.25);
    }

    #[test]
    fn canonical_traits_are_all_open() {
        let t = NeotenicTraits::CANONICAL;
        assert!(t.play_budget_protected && t.proceduralization_deferred && t.epigenetic_openness);
    }
}
