//! Telomere shortening mapped to bounded fork lineages (Hayflick limit).
//!
//! Biological mechanism: each cell division erodes chromosome ends; after
//! ~50 divisions the cell enters replicative senescence. This is a feature,
//! not a bug: it caps clonal expansion and forces renewal through stem cells
//! (where telomerase is active). GenOS mapping: every fork decrements a
//! lineage counter; exhausted lineages must renew through breeding or an
//! explicit, human-approved "stem re-certification" (telomerase), never by
//! silent forking.

/// Fork budget attached to a capsule lineage.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TelomereCounter {
    /// Forks still allowed before exhaustion.
    pub remaining: u32,
    /// Total budget the lineage started with (for ratio reporting).
    pub max_forks: u32,
}

/// Result of requesting one fork.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ForkVerdict {
    /// Budget consumed; fork may proceed (caller journals the decrement).
    Allowed { remaining_after: u32 },
    /// Warning zone crossed with this fork: breeding is now advised.
    AllowedWarning { remaining_after: u32 },
    /// Exhausted: fork refused. Renewal required.
    Exhausted,
}

/// Fraction of budget below which the warning zone starts.
pub const WARNING_ZONE_RATIO: f64 = 0.25;

impl TelomereCounter {
    pub fn new(max_forks: u32) -> Self {
        TelomereCounter { remaining: max_forks, max_forks }
    }

    /// Consume one unit of fork budget, fail-closed at zero.
    pub fn consume_for_fork(&mut self) -> ForkVerdict {
        if self.remaining == 0 {
            return ForkVerdict::Exhausted;
        }
        self.remaining -= 1;
        let remaining_after = self.remaining;
        let warning_floor =
            (self.max_forks as f64 * WARNING_ZONE_RATIO).ceil() as u32;
        if remaining_after <= warning_floor {
            ForkVerdict::AllowedWarning { remaining_after }
        } else {
            ForkVerdict::Allowed { remaining_after }
        }
    }

    /// Ratio of budget left, in [0,1].
    pub fn remaining_ratio(&self) -> f64 {
        if self.max_forks == 0 {
            0.0
        } else {
            self.remaining as f64 / self.max_forks as f64
        }
    }

    /// Telomerase activation ("stem re-certification"): restore the budget to
    /// `new_max`. Deliberately explicit and capped: this is the controlled
    /// exception, not a loophole — callers must journal a human approval.
    /// Restorations beyond the cap are refused (anti-immortalization guard).
    pub fn telomerase_restore(
        &mut self,
        new_max: u32,
        restoration_count: u8,
        max_restorations: u8,
    ) -> Result<(), String> {
        if restoration_count >= max_restorations {
            return Err(format!(
                "telomerase restorations exhausted ({restoration_count}/{max_restorations}): \
                 lineage must go through breeding"
            ));
        }
        let ceiling = self.max_forks.saturating_mul(2);
        if new_max > ceiling {
            return Err(format!(
                "requested budget {new_max} exceeds anti-immortalization ceiling {ceiling}"
            ));
        }
        if new_max <= self.remaining {
            return Err("restoration must strictly increase the remaining budget".to_string());
        }
        self.max_forks = new_max;
        self.remaining = new_max;
        Ok(())
    }

    /// True when the lineage should prefer breeding over forking.
    pub fn should_breed(&self) -> bool {
        matches!(self.consume_preview(), ForkPreview::Warning | ForkPreview::Exhausted)
    }
}

/// Non-mutating preview used by orchestrators to plan ahead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForkPreview {
    Healthy,
    Warning,
    Exhausted,
}

impl TelomereCounter {
    fn consume_preview(&self) -> ForkPreview {
        if self.remaining == 0 {
            ForkPreview::Exhausted
        } else {
            let warning_floor =
                (self.max_forks as f64 * WARNING_ZONE_RATIO).ceil() as u32;
            if self.remaining - 1 <= warning_floor {
                ForkPreview::Warning
            } else {
                ForkPreview::Healthy
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forks_decrement_until_exhaustion_blocks() {
        let mut counter = TelomereCounter::new(3);
        assert!(matches!(
            counter.consume_for_fork(),
            ForkVerdict::Allowed { remaining_after: 2 }
        ));
        counter.consume_for_fork();
        counter.consume_for_fork();
        assert_eq!(counter.remaining, 0);
        assert_eq!(counter.consume_for_fork(), ForkVerdict::Exhausted);
    }

    #[test]
    fn warning_zone_starts_at_twenty_five_percent_budget() {
        let mut counter = TelomereCounter::new(10);
        // Warning floor = ceil(10 * 0.25) = 3: forks landing at remaining > 3
        // are healthy.
        for _ in 0..6 {
            let verdict = counter.consume_for_fork();
            assert!(matches!(verdict, ForkVerdict::Allowed { .. }));
        }
        assert!(matches!(
            counter.consume_for_fork(),
            ForkVerdict::AllowedWarning { remaining_after: 3 }
        ));
        for expected in [2, 1, 0] {
            assert!(matches!(
                counter.consume_for_fork(),
                ForkVerdict::AllowedWarning { .. }
            ), "expected warning at {expected}");
        }
        assert_eq!(counter.consume_for_fork(), ForkVerdict::Exhausted);
    }

    #[test]
    fn telomerase_restores_within_ceiling_and_counts() {
        let mut counter = TelomereCounter::new(10);
        counter.remaining = 0;
        counter
            .telomerase_restore(15, 0, 2)
            .expect("first restoration allowed");
        assert_eq!(counter.remaining, 15);
        // Beyond the 2x anti-immortalization ceiling.
        assert!(counter.telomerase_restore(31, 1, 2).is_err());
        // Restoration quota exhausted → forced breeding.
        assert!(counter.telomerase_restore(16, 2, 2).is_err());
    }

    #[test]
    fn non_increasing_restoration_is_refused() {
        let mut counter = TelomereCounter::new(10);
        assert!(counter.telomerase_restore(5, 0, 3).is_err());
    }

    #[test]
    fn breeding_is_advised_in_warning_zone() {
        let fresh = TelomereCounter::new(10);
        assert!(!fresh.should_breed());
        let tired = TelomereCounter { remaining: 2, max_forks: 10 };
        assert!(tired.should_breed());
    }
}
