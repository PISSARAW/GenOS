//! Allopatric speciation mapped to controlled lineage divergence and
//! breeding compatibility.
//!
//! Biological mechanism: geographically isolated populations diverge without
//! gene flow until they become separate species — sometimes unable to cross.
//! GenOS mapping: worlds are the "geography" (`genos-world` CoW isolation);
//! time in isolation grows an estimated divergence; pairings across the
//! boundary degrade from SameSpecies to HybridSterile to Incompatible,
//! making merges and breeding explicitly safe at scale.

/// Genetic distance between two allele sets, in [0,1] (1 - Jaccard).
/// Alleles are discrete markers (gene names, opéron signatures).
pub fn genetic_distance(a: &[String], b: &[String]) -> f64 {
    let set_a: std::collections::BTreeSet<&String> = a.iter().collect();
    let set_b: std::collections::BTreeSet<&String> = b.iter().collect();
    let inter = set_a.intersection(&set_b).count();
    let union = set_a.union(&set_b).count();
    if union == 0 {
        return 0.0;
    }
    1.0 - (inter as f64 / union as f64)
}

/// Reproductive compatibility verdict for a pairing or a merge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairingVerdict {
    /// Normal crossing allowed.
    SameSpecies,
    /// Crossing tolerated but offspring is non-breedable (stérilité hybride):
    /// the hybrid may run, never reproduce.
    HybridSterile,
    /// Merge/crossing refused outright.
    IncompatibleSpecies,
}

/// Divergence boundaries, as fractions of total allele pool.
#[derive(Debug, Clone, Copy)]
pub struct SpeciesBoundary {
    /// Above this distance, hybrids are sterile.
    pub hybrid_threshold: f64,
    /// Above this distance, species are incompatible.
    pub speciation_threshold: f64,
}

impl Default for SpeciesBoundary {
    fn default() -> Self {
        SpeciesBoundary {
            hybrid_threshold: 0.30,
            speciation_threshold: 0.60,
        }
    }
}

impl SpeciesBoundary {
    pub fn verdict(&self, distance: f64) -> PairingVerdict {
        if distance >= self.speciation_threshold {
            PairingVerdict::IncompatibleSpecies
        } else if distance >= self.hybrid_threshold {
            PairingVerdict::HybridSterile
        } else {
            PairingVerdict::SameSpecies
        }
    }
}

/// A durable geographic-style isolation between two lineage groups living in
/// different world substrates. Divergence accumulates while the barrier holds.
#[derive(Debug, Clone, PartialEq)]
pub struct IsolationBarrier {
    pub group_a: String,
    pub group_b: String,
    pub since_day: f64,
}

impl IsolationBarrier {
    /// Estimated divergence after `now_day` days of allopatry under a daily
    /// drift rate, saturating at full separation (1.0).
    pub fn estimated_divergence(&self, now_day: f64, drift_rate_per_day: f64) -> f64 {
        let days = (now_day - self.since_day).max(0.0);
        (drift_rate_per_day * days).min(1.0)
    }

    /// Whether a merge attempt between the two groups should even be offered:
    /// below the hybrid threshold yes; above it, only through explicit hybrid
    /// protocols (sterile offspring), past speciation never automatically.
    pub fn merge_allowed(
        &self,
        now_day: f64,
        drift_rate_per_day: f64,
        boundary: &SpeciesBoundary,
    ) -> PairingVerdict {
        boundary.verdict(self.estimated_divergence(now_day, drift_rate_per_day))
    }
}

/// Mark a child produced from a sterile hybrid pairing: runnable, non-breedable.
#[derive(Debug, Clone, PartialEq)]
pub struct SterilityMark {
    pub reason: String,
}

pub fn sterility_mark(parent_distance: f64, boundary: &SpeciesBoundary) -> Option<SterilityMark> {
    if parent_distance >= boundary.hybrid_threshold
        && parent_distance < boundary.speciation_threshold
    {
        Some(SterilityMark {
            reason: format!(
                "hybrid of lineages at genetic distance {parent_distance:.2} \
                 (sterile band [{:.2}, {:.2}))",
                boundary.hybrid_threshold, boundary.speciation_threshold
            ),
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_alleles_have_zero_distance() {
        let genes = vec!["opA".to_string(), "opB".to_string()];
        assert_eq!(genetic_distance(&genes, &genes), 0.0);
    }

    #[test]
    fn disjoint_allele_sets_are_fully_diverged() {
        let a = vec!["x".to_string()];
        let b = vec!["y".to_string()];
        assert_eq!(genetic_distance(&a, &b), 1.0);
    }

    #[test]
    fn pairing_degrades_through_the_three_bands() {
        let boundary = SpeciesBoundary::default();
        assert_eq!(boundary.verdict(0.10), PairingVerdict::SameSpecies);
        assert_eq!(boundary.verdict(0.45), PairingVerdict::HybridSterile);
        assert_eq!(boundary.verdict(0.75), PairingVerdict::IncompatibleSpecies);
    }

    #[test]
    fn allopatric_divergence_accumulates_and_saturates() {
        let barrier = IsolationBarrier {
            group_a: "school-a".into(),
            group_b: "school-b".into(),
            since_day: 100.0,
        };
        assert!((barrier.estimated_divergence(110.0, 0.02) - 0.20).abs() < 1e-9);
        assert_eq!(barrier.estimated_divergence(200.0, 0.02), 1.0);
    }

    #[test]
    fn merge_verdict_tracks_isolation_duration() {
        let barrier = IsolationBarrier {
            group_a: "a".into(),
            group_b: "b".into(),
            since_day: 0.0,
        };
        let boundary = SpeciesBoundary::default();
        assert_eq!(
            barrier.merge_allowed(5.0, 0.02, &boundary),
            PairingVerdict::SameSpecies
        );
        assert_eq!(
            barrier.merge_allowed(25.0, 0.02, &boundary),
            PairingVerdict::HybridSterile
        );
        assert_eq!(
            barrier.merge_allowed(60.0, 0.02, &boundary),
            PairingVerdict::IncompatibleSpecies
        );
    }

    #[test]
    fn sterile_hybrids_carry_an_explicit_mark() {
        let boundary = SpeciesBoundary::default();
        let mark = sterility_mark(0.45, &boundary).expect("sterile band");
        assert!(mark.reason.contains("0.45"));
        assert!(sterility_mark(0.10, &boundary).is_none());
        assert!(sterility_mark(0.90, &boundary).is_none());
    }
}
