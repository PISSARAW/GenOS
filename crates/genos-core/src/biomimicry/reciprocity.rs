//! Reciprocal altruism mapped to evolutionary-game cooperation between
//! agents.
//!
//! Biological mechanism: blood-sharing vampire bats cooperate only with
//! partners they recognize, remember, and can punish. Axelrod's tournaments
//! show Tit-for-Tat (cooperate first, mirror afterwards, tolerate noise)
//! is evolutionarily stable against pure defectors. Free-riding is contained
//! by conditional cooperation plus measurable sanctions — no central
//! authority required.

/// A single observed move from a counterpart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerAction {
    Cooperate,
    Defect,
}

/// Memory of one counterpart's behavior.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PeerRecord {
    pub cooperations: u32,
    pub defections: u32,
    pub last_action: Option<PeerAction>,
}

impl PeerRecord {
    pub fn interactions(&self) -> u32 {
        self.cooperations + self.defections
    }

    /// Defection ratio over all interactions; zero when untested.
    pub fn defection_ratio(&self) -> f64 {
        if self.interactions() == 0 {
            0.0
        } else {
            self.defections as f64 / self.interactions() as f64
        }
    }
}

/// Conditional-cooperation decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Extend cooperation (first contact, mirrored cooperation, or forgiven).
    Cooperate,
    /// Mirror a defection or apply an earned sanction.
    Retaliate,
}

/// Tit-for-Tat with bounded forgiveness, tuned by two knobs:
/// - `sanction_threshold`: defection ratio above which retaliation locks in;
/// - `amends_interactions`: cooperative interactions needed to lift a lock-in.
#[derive(Debug, Clone)]
pub struct ReciprocityPolicy {
    pub sanction_threshold: f64,
    pub amends_interactions: u32,
}

impl Default for ReciprocityPolicy {
    fn default() -> Self {
        ReciprocityPolicy {
            sanction_threshold: 0.5,
            amends_interactions: 2,
        }
    }
}

impl ReciprocityPolicy {
    /// Decide how to treat `peer` given its recorded history. Unknown peers
    /// get cooperation first (Axelrod's "nice" property); known defectors are
    /// mirrored; locked-in sanctions lift only after sustained amends.
    pub fn decide(&self, peer: &PeerRecord) -> Decision {
        let Some(last) = peer.last_action else {
            return Decision::Cooperate; // nice: never defect first
        };
        let locked_in = peer.defection_ratio() >= self.sanction_threshold
            && peer.interactions() >= 3;
        if locked_in {
            // Forgiveness path: recent sustained cooperation lifts the ban.
            let tail_coops = peer.cooperations.saturating_sub(1);
            if tail_coops >= self.amends_interactions {
                return Decision::Cooperate;
            }
            return Decision::Retaliate;
        }
        match last {
            PeerAction::Cooperate => Decision::Cooperate,
            // Noise tolerance (Tit-for-Two-Tats flavor): an isolated defection
            // from a well-behaved partner is treated as noise, not betrayal.
            PeerAction::Defect
                if peer.defection_ratio() < self.sanction_threshold / 2.0 =>
            {
                Decision::Cooperate
            }
            PeerAction::Defect => Decision::Retaliate,
        }
    }
}

/// Ledger over all counterparts this agent has interacted with.
#[derive(Debug, Clone, Default)]
pub struct ReputationLedger {
    pub peers: std::collections::BTreeMap<String, PeerRecord>,
}

impl ReputationLedger {
    pub fn record_outcome(&mut self, peer_id: &str, action: PeerAction) {
        let entry = self.peers.entry(peer_id.to_string()).or_default();
        match action {
            PeerAction::Cooperate => entry.cooperations += 1,
            PeerAction::Defect => entry.defections += 1,
        }
        entry.last_action = Some(action);
    }

    pub fn decide(&self, policy: &ReciprocityPolicy, peer_id: &str) -> Decision {
        let empty = PeerRecord::default();
        let record = self.peers.get(peer_id).unwrap_or(&empty);
        policy.decide(record)
    }

    /// Fleet-level social health: global cooperation ratio. Returns `None`
    /// when nothing was ever recorded.
    pub fn cooperation_index(&self) -> Option<f64> {
        let coops: u64 = self.peers.values().map(|p| p.cooperations as u64).sum();
        let defects: u64 = self.peers.values().map(|p| p.defections as u64).sum();
        let total = coops + defects;
        if total == 0 {
            None
        } else {
            Some(coops as f64 / total as f64)
        }
    }

    /// Peers currently under active sanction (free-riders to watch).
    pub fn free_riders(&self, policy: &ReciprocityPolicy) -> Vec<String> {
        self.peers
            .iter()
            .filter(|(_, record)| policy.decide(record) == Decision::Retaliate)
            .map(|(id, _)| id.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_peer_gets_first_cooperation() {
        let policy = ReciprocityPolicy::default();
        assert_eq!(policy.decide(&PeerRecord::default()), Decision::Cooperate);
    }

    #[test]
    fn tit_for_tat_mirrors_last_action() {
        let policy = ReciprocityPolicy::default();
        let mut ledger = ReputationLedger::default();
        ledger.record_outcome("p1", PeerAction::Cooperate);
        assert_eq!(ledger.decide(&policy, "p1"), Decision::Cooperate);
        ledger.record_outcome("p1", PeerAction::Defect);
        assert_eq!(ledger.decide(&policy, "p1"), Decision::Retaliate);
    }

    #[test]
    fn occasional_defection_is_forgiven_as_noise() {
        let policy = ReciprocityPolicy::default();
        let mut record = PeerRecord::default();
        for _ in 0..4 {
            record.cooperations += 1;
        }
        record.defections += 1; // ratio 0.2 < threshold 0.5
        record.last_action = Some(PeerAction::Defect);
        assert_eq!(policy.decide(&record), Decision::Cooperate);
    }

    #[test]
    fn free_rider_locks_in_until_amends() {
        let policy = ReciprocityPolicy::default();
        let mut record = PeerRecord::default();
        for _ in 0..4 {
            record.defections += 1;
        }
        record.last_action = Some(PeerAction::Defect);
        assert_eq!(policy.decide(&record), Decision::Retaliate);

        // Amends: two cooperations recorded on top of the defecting history.
        let mut amending = record.clone();
        amending.cooperations += 2;
        amending.last_action = Some(PeerAction::Cooperate);
        // Ratio still 4/6 ≈ 0.67 → locked in despite last being cooperative…
        assert_eq!(policy.decide(&amending), Decision::Retaliate);
        // …but one more cooperation crosses the amends requirement.
        amending.cooperations += 1;
        amending.last_action = Some(PeerAction::Cooperate);
        assert_eq!(policy.decide(&amending), Decision::Cooperate);
    }

    #[test]
    fn cooperation_index_and_free_riders_listing() {
        let mut ledger = ReputationLedger::default();
        for _ in 0..5 {
            ledger.record_outcome("good", PeerAction::Cooperate);
        }
        for _ in 0..4 {
            ledger.record_outcome("bad", PeerAction::Defect);
        }
        let policy = ReciprocityPolicy::default();
        assert!((ledger.cooperation_index().unwrap() - 5.0 / 9.0).abs() < 1e-9);
        assert_eq!(ledger.free_riders(&policy), vec!["bad".to_string()]);
        assert_eq!(ledger.decide(&policy, "stranger"), Decision::Cooperate);
    }
}
