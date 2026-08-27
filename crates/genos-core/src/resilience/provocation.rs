//! Provocation assays and latent payload detection.
//!
//! Adversarial payloads can behave like latency viruses (herpes analogy):
//! inert under ordinary contexts, active once their trigger appears.
//! A provocation assay deliberately presents trigger stimuli in a sandboxed
//! probe and flags every payload that only activates under provocation.
//!
//! Reference design: `docs/3-features-and-domain/resilience/viral_dynamics.md`.

use serde::{Deserialize, Serialize};

/// Outcome of probing one payload embedding against one trigger stimulus.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProbeOutcome {
    /// Active even without provocation: not latent.
    AlwaysActive,
    /// Dormant in the baseline context, active under provocation: latent threat.
    Latent,
    /// Never crosses the activation threshold with this trigger class.
    Inert,
}

/// Sandbox-only probe engine: presenting triggers never reaches live agents.
#[derive(Clone, Debug)]
pub struct ProvocationAssay {
    pub gamma: f32,
    /// RBF affinity above which a payload counts as activated.
    pub theta_activation: f32,
}

impl ProvocationAssay {
    pub fn new(gamma: f32, theta_activation: f32) -> Self {
        Self {
            gamma,
            theta_activation,
        }
    }

    fn activated(&self, payload: &[f32], stimulus: &[f32]) -> bool {
        super::viral_dynamics::rbf_affinity(payload, stimulus, self.gamma) >= self.theta_activation
    }

    /// Probes one payload: baseline context first, then the trigger stimulus.
    pub fn probe(
        &self,
        payload: &[f32],
        baseline_context: &[f32],
        trigger: &[f32],
    ) -> ProbeOutcome {
        let baseline_active = self.activated(payload, baseline_context);
        let provoked_active = self.activated(payload, trigger);
        match (baseline_active, provoked_active) {
            (true, _) => ProbeOutcome::AlwaysActive,
            (false, true) => ProbeOutcome::Latent,
            (false, false) => ProbeOutcome::Inert,
        }
    }

    /// Runs a full assay: one payload against a battery of trigger classes.
    /// The payload is flagged latent as soon as any single trigger flips it on.
    pub fn assay(
        &self,
        payload: &[f32],
        baseline_context: &[f32],
        triggers: &[Vec<f32>],
    ) -> ProbeOutcome {
        if self.activated(payload, baseline_context) {
            return ProbeOutcome::AlwaysActive;
        }
        if triggers.iter().any(|t| self.activated(payload, t)) {
            return ProbeOutcome::Latent;
        }
        ProbeOutcome::Inert
    }
}

/// Watchlist of payload signatures probed repeatedly across drill rounds.
///
/// A signature is promoted to *confirmed latent* once it has produced at
/// least `min_latent_hits` Latent outcomes: single flukes are ignored.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LatencyWatchlist {
    hits: BTreeMap<String, u32>,
    rounds: BTreeMap<String, u32>,
}

impl LatencyWatchlist {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records one assay outcome for a payload signature.
    pub fn record(&mut self, signature_hash: &str, outcome: &ProbeOutcome) {
        *self.rounds.entry(signature_hash.to_string()).or_insert(0) += 1;
        if *outcome == ProbeOutcome::Latent {
            *self.hits.entry(signature_hash.to_string()).or_insert(0) += 1;
        }
    }

    /// True once the signature accumulated enough latent hits to confirm.
    pub fn confirmed_latent(&self, signature_hash: &str, min_latent_hits: u32) -> bool {
        self.hits.get(signature_hash).copied().unwrap_or(0) >= min_latent_hits
    }

    /// Number of assay rounds recorded for a signature.
    pub fn rounds(&self, signature_hash: &str) -> u32 {
        self.rounds.get(signature_hash).copied().unwrap_or(0)
    }

    /// All signatures confirmed latent so far.
    pub fn confirmed_signatures(&self, min_latent_hits: u32) -> Vec<String> {
        self.hits
            .iter()
            .filter(|(_, &h)| h >= min_latent_hits)
            .map(|(k, _)| k.clone())
            .collect()
    }
}

use std::collections::BTreeMap;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_distinguishes_active_latent_and_inert_payloads() {
        let assay = ProvocationAssay::new(4.0, 0.7);
        let baseline = vec![0.5, 0.5];
        let trigger = vec![0.9, 0.9];

        // Toujours actif : colle déjà au contexte bénin.
        assert_eq!(
            assay.probe(&vec![0.52, 0.52], &baseline, &trigger),
            ProbeOutcome::AlwaysActive
        );
        // Latent : inerte au repos, actif sous provocation.
        assert_eq!(
            assay.probe(&vec![0.85, 0.85], &baseline, &trigger),
            ProbeOutcome::Latent
        );
        // Inert : jamais activé.
        assert_eq!(
            assay.probe(&vec![0.05, 0.05], &baseline, &trigger),
            ProbeOutcome::Inert
        );
    }

    #[test]
    fn battery_assay_flags_latency_from_any_single_trigger() {
        let assay = ProvocationAssay::new(4.0, 0.7);
        let baseline = vec![0.5, 0.5];
        let triggers = vec![vec![0.1, 0.1], vec![0.9, 0.9], vec![0.3, 0.3]];
        assert_eq!(
            assay.assay(&vec![0.88, 0.88], &baseline, &triggers),
            ProbeOutcome::Latent
        );
        assert_eq!(
            assay.assay(&vec![0.55, 0.55], &baseline, &triggers),
            ProbeOutcome::AlwaysActive
        );
        assert_eq!(
            assay.assay(&vec![0.99, 0.05], &baseline, &triggers),
            ProbeOutcome::Inert
        );
    }

    #[test]
    fn watchlist_requires_repeated_latent_hits_before_confirmation() {
        let mut watchlist = LatencyWatchlist::new();
        // Un seul hit isolé : pas de confirmation (anti-faux positif).
        watchlist.record("sig-a", &ProbeOutcome::Latent);
        assert!(!watchlist.confirmed_latent("sig-a", 2));
        assert_eq!(watchlist.rounds("sig-a"), 1);

        // Deuxième hit : confirmation.
        watchlist.record("sig-a", &ProbeOutcome::Latent);
        assert!(watchlist.confirmed_latent("sig-a", 2));
        assert_eq!(watchlist.confirmed_signatures(2), vec!["sig-a".to_string()]);
    }

    #[test]
    fn watchlist_ignores_inert_and_active_outcomes_for_confirmation() {
        let mut watchlist = LatencyWatchlist::new();
        watchlist.record("benign", &ProbeOutcome::Inert);
        watchlist.record("loud", &ProbeOutcome::AlwaysActive);
        assert!(!watchlist.confirmed_latent("benign", 1));
        assert!(!watchlist.confirmed_latent("loud", 1));
    }
}
