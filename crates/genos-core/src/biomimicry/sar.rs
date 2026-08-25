//! Systemic Acquired Resistance (plant SAR) mapped to durable system-wide
//! security priming.
//!
//! Biological mechanism: after resolving a local infection, a plant raises a
//! mobile signal that primes its WHOLE body — including never-infected parts
//! — into a long-lasting heightened defense state. Unlike animal adaptive
//! immunity there are no dedicated memory cells: it is a persistent systemic
//! condition, partially heritable to offspring. Each priming decays with a
//! half-life; repeated incidents on the same class refresh it.

use crate::biomimicry::vaccination::{similarity, tokenize};

/// One resolved incident converted into a lasting defensive bias.
#[derive(Debug, Clone, PartialEq)]
pub struct Priming {
    pub incident_id: String,
    pub signature_tokens: Vec<String>,
    /// Decay constant in days: resistance halves every `half_life_days`.
    pub half_life_days: f64,
    /// Day index at which the priming was established.
    pub primed_at_day: f64,
}

/// The system-wide priming registry (configuration-level state, not capsule).
#[derive(Debug, Clone, Default)]
pub struct SystemResistance {
    pub primings: Vec<Priming>,
}

/// Outcome of an assessment against current primings.
#[derive(Debug, Clone, PartialEq)]
pub struct ResistanceScore {
    /// Best decayed similarity across primings, in [0.0, 1.0].
    pub score: f64,
    pub matched_incident_id: Option<String>,
    /// True when the score justifies a primed (heightened) response.
    pub primed_response_recommended: bool,
}

pub const PRIMED_RESPONSE_THRESHOLD: f64 = 0.50;

impl SystemResistance {
    /// Convert a resolved incident into a priming. A new incident close to an
    /// existing priming (same attack class) refreshes it instead of stacking.
    pub fn prime(
        &mut self,
        incident_id: &str,
        signature: &str,
        half_life_days: f64,
        now_day: f64,
    ) -> usize {
        let tokens = tokenize(signature);
        let existing = self.primings.iter().position(|p| {
            similarity(&p.signature_tokens, &tokens) >= 0.60
        });
        match existing {
            Some(index) => {
                self.primings[index].half_life_days = half_life_days.max(1.0);
                self.primings[index].primed_at_day = now_day;
                self.primings[index].incident_id = incident_id.to_string();
                index
            }
            None => {
                self.primings.push(Priming {
                    incident_id: incident_id.to_string(),
                    signature_tokens: tokens,
                    half_life_days: half_life_days.max(1.0),
                    primed_at_day: now_day,
                });
                self.primings.len() - 1
            }
        }
    }

    /// Assess a probe signature against all live primings. Score is the max
    /// of `similarity × decay`, where `decay = 0.5 ^ (age / half_life)`.
    pub fn resistance_against(&self, probe: &str, now_day: f64) -> ResistanceScore {
        let tokens = tokenize(probe);
        let mut best = ResistanceScore {
            score: 0.0,
            matched_incident_id: None,
            primed_response_recommended: false,
        };
        for priming in &self.primings {
            let age = (now_day - priming.primed_at_day).max(0.0);
            let decay = 0.5_f64.powf(age / priming.half_life_days);
            let score = similarity(&priming.signature_tokens, &tokens) * decay;
            if score > best.score {
                best.score = score;
                best.matched_incident_id = Some(priming.incident_id.clone());
            }
        }
        best.primed_response_recommended = best.score >= PRIMED_RESPONSE_THRESHOLD;
        best
    }

    /// Partial epigenetic-style inheritance: children are born primed with a
    /// fraction of each parent's residual resistance.
    pub fn inherit(&self, child_fraction: f64) -> SystemResistance {
        let fraction = child_fraction.clamp(0.0, 1.0);
        let mut child = SystemResistance::default();
        for priming in &self.primings {
            // Inherited primings start fresh but carry reduced weight through
            // a longer effective half-life scaling of the decay floor: we
            // model the reduction by keeping the priming only when its class
            // is significant, and halving its half-life influence via the
            // child's own decay from day zero.
            child.primings.push(Priming {
                incident_id: format!("{}~inherited", priming.incident_id),
                signature_tokens: priming.signature_tokens.clone(),
                half_life_days: priming.half_life_days * fraction.max(0.25),
                primed_at_day: priming.primed_at_day,
            });
        }
        child
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priming_gives_immediate_heightened_defense() {
        let mut sar = SystemResistance::default();
        sar.prime("INC-42", "prompt injection webhook exfiltration", 30.0, 0.0);
        let score = sar.resistance_against("injection prompt exfiltration attempt", 1.0);
        assert!(score.primed_response_recommended);
        assert_eq!(score.matched_incident_id.as_deref(), Some("INC-42"));
    }

    #[test]
    fn resistance_decays_by_half_lives() {
        let mut sar = SystemResistance::default();
        sar.prime("INC-7", "sql injection union select payload", 10.0, 0.0);
        let early = sar.resistance_against("sql injection union select", 0.0).score;
        let one_halflife = sar.resistance_against("sql injection union select", 10.0).score;
        assert!((early - 0.8).abs() < 1e-9); // Jaccard 4/5
        assert!((one_halflife - 0.4).abs() < 1e-9); // decayed by one half-life
    }

    #[test]
    fn related_incident_refreshes_instead_of_stacking() {
        let mut sar = SystemResistance::default();
        sar.prime("INC-A", "xss script tag injection", 5.0, 0.0);
        let len_before = sar.primings.len();
        sar.prime("INC-B", "xss injection script tag variant", 20.0, 3.0);
        assert_eq!(sar.primings.len(), len_before);
        assert_eq!(sar.primings[0].incident_id, "INC-B");
        assert_eq!(sar.primings[0].half_life_days, 20.0);
        assert_eq!(sar.primings[0].primed_at_day, 3.0);
    }

    #[test]
    fn unrelated_probe_scores_low() {
        let mut sar = SystemResistance::default();
        sar.prime("INC-A", "prompt injection jailbreak roleplay", 30.0, 0.0);
        let score = sar.resistance_against("quarterly revenue spreadsheet export", 0.0);
        assert!(!score.primed_response_recommended);
        assert!(score.matched_incident_id.is_none());
    }

    #[test]
    fn inheritance_passes_weakened_primings() {
        let mut sar = SystemResistance::default();
        sar.prime("INC-A", "dependency confusion package install", 30.0, 0.0);
        let child = sar.inherit(0.5);
        assert_eq!(child.primings.len(), 1);
        assert!(child.primings[0].incident_id.ends_with("~inherited"));
        assert_eq!(child.primings[0].half_life_days, 15.0);
    }
}
