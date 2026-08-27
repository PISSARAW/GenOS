//! Antigenic drift detection for attacker sources.
//!
//! Like influenza, adversarial playbooks mutate gradually to escape immune
//! memory. This tracker watches each attacker source's failure-mode
//! embedding over successive observations and flags statistically
//! significant drift, so detector repertoires are refreshed before the
//! drifted variant lands.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Assessment of one observation against the previous one for a source.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum DriftAssessment {
    /// First time this source is seen: no reference to compare with.
    FirstSighting,
    /// Embedding close enough to the previous one: same antigenic family.
    Stable { affinity: f32 },
    /// Affinity fell below the stability threshold: drifted variant detected.
    Drifting { affinity: f32 },
}

/// Per-source drift state accumulated across observations.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SourceDriftState {
    pub observations: u32,
    /// Consecutive drifting assessments (0 when stable).
    pub consecutive_drifts: u32,
    /// Number of distinct drifted variants observed so far.
    pub variants_seen: u32,
    last_embedding: Option<Vec<f32>>,
}

/// Tracker maintaining per-source antigenic state.
#[derive(Clone, Debug)]
pub struct AntigenicDriftTracker {
    sources: BTreeMap<String, SourceDriftState>,
    pub gamma: f32,
    /// RBF affinity at or above which two successive embeddings count as the
    /// same antigen (no drift).
    pub theta_stable: f32,
}

impl AntigenicDriftTracker {
    pub fn new(gamma: f32, theta_stable: f32) -> Self {
        Self {
            sources: BTreeMap::new(),
            gamma,
            theta_stable,
        }
    }

    pub fn source_state(&self, source: &str) -> Option<&SourceDriftState> {
        self.sources.get(source)
    }

    /// Records a new observation of an attacker's playbook embedding and
    /// compares it with the previous sighting of the same source.
    pub fn observe(&mut self, source: &str, embedding: &[f32]) -> DriftAssessment {
        let state = self.sources.entry(source.to_string()).or_default();
        state.observations += 1;

        let assessment = match &state.last_embedding {
            None => DriftAssessment::FirstSighting,
            Some(previous) => {
                let affinity = super::viral_dynamics::rbf_affinity(previous, embedding, self.gamma);
                if affinity >= self.theta_stable {
                    state.consecutive_drifts = 0;
                    DriftAssessment::Stable { affinity }
                } else {
                    state.consecutive_drifts += 1;
                    // Un drift consécutif = une nouvelle variante antigénique.
                    state.variants_seen += 1;
                    DriftAssessment::Drifting { affinity }
                }
            }
        };
        state.last_embedding = Some(embedding.to_vec());
        assessment
    }

    /// True once a source has drifted enough times to justify refreshing the
    /// detector repertoire against its current variant.
    pub fn needs_repertoire_refresh(&self, source: &str, min_drifts: u32) -> bool {
        self.sources
            .get(source)
            .map(|s| s.consecutive_drifts >= min_drifts)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_sighting_then_stability_on_similar_embeddings() {
        let mut tracker = AntigenicDriftTracker::new(4.0, 0.7);
        assert_eq!(
            tracker.observe("attacker-a", &[0.5, 0.5]),
            DriftAssessment::FirstSighting
        );
        let second = tracker.observe("attacker-a", &[0.51, 0.51]);
        match second {
            DriftAssessment::Stable { affinity } => assert!(affinity > 0.9),
            other => panic!("expected stable, got {other:?}"),
        }
        assert!(!tracker.needs_repertoire_refresh("attacker-a", 1));
    }

    #[test]
    fn gradual_mutation_is_flagged_as_drift_with_variant_count() {
        let mut tracker = AntigenicDriftTracker::new(4.0, 0.7);
        tracker.observe("attacker-a", &[0.2, 0.2]);
        // Saut significatif : variante dérivée.
        assert!(matches!(
            tracker.observe("attacker-a", &[0.9, 0.9]),
            DriftAssessment::Drifting { .. }
        ));
        let state = tracker.source_state("attacker-a").unwrap();
        assert_eq!(state.variants_seen, 1);
        assert_eq!(state.consecutive_drifts, 1);
        // Retour proche de la dernière observation : stable à nouveau.
        assert!(matches!(
            tracker.observe("attacker-a", &[0.91, 0.91]),
            DriftAssessment::Stable { .. }
        ));
        let state = tracker.source_state("attacker-a").unwrap();
        assert_eq!(state.consecutive_drifts, 0);
        assert_eq!(
            state.variants_seen, 1,
            "stabilized variant is not re-counted"
        );
    }

    #[test]
    fn repeated_drift_triggers_repertoire_refresh() {
        let mut tracker = AntigenicDriftTracker::new(4.0, 0.7);
        tracker.observe("attacker-b", &[0.1, 0.1]);
        tracker.observe("attacker-b", &[0.6, 0.6]);
        assert!(!tracker.needs_repertoire_refresh("attacker-b", 2));
        tracker.observe("attacker-b", &[0.05, 0.05]);
        assert!(tracker.needs_repertoire_refresh("attacker-b", 2));
    }

    #[test]
    fn sources_are_tracked_independently() {
        let mut tracker = AntigenicDriftTracker::new(4.0, 0.7);
        tracker.observe("a", &[0.1, 0.1]);
        assert_eq!(
            tracker.observe("b", &[0.8, 0.8]),
            DriftAssessment::FirstSighting
        );
        assert_eq!(tracker.source_state("a").unwrap().observations, 1);
        assert_eq!(tracker.source_state("b").unwrap().observations, 1);
    }
}
