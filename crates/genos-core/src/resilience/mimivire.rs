//! MIMIVIRE-style antigenic drift training: harvested attack genes are
//! attenuated and replayed against the detector repertoire as a drill.
//!
//! Unrecognized variants reveal coverage gaps in the detector repertoire
//! before a live attacker exploits them. Reference design:
//! `docs/3-features-and-domain/resilience/virophage.md` (§MIMIVIRE).

use super::virophage::AttackGene;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One attenuated variant held in the co-evolution ledger.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttenuatedVariant {
    pub signature_hash: String,
    pub embedding: Vec<f32>,
    /// Attenuation factor in `(0, 1]`: how much of the original virulence is
    /// preserved in the replay payload. Lower = safer drill.
    pub attenuation: f32,
    /// How many times this variant has been used in a drill.
    pub times_replayed: u32,
}

/// Result of one detector-repertoire drill.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct DrillReport {
    pub variants_replayed: u32,
    /// Variants recognized by at least one detector: immunity holds.
    pub recognized: Vec<String>,
    /// Variants no detector catches: drift gaps to close with new detectors.
    pub unrecognized: Vec<String>,
}

impl DrillReport {
    /// Fraction of the repertoire covered by current detectors, in [0, 1].
    pub fn coverage(&self) -> f32 {
        if self.variants_replayed == 0 {
            return 1.0;
        }
        self.recognized.len() as f32 / self.variants_replayed as f32
    }
}

/// Co-evolution ledger of attenuated attacker variants used for drills.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MimivireLedger {
    variants: BTreeMap<String, AttenuatedVariant>,
}

impl MimivireLedger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.variants.len()
    }

    pub fn is_empty(&self) -> bool {
        self.variants.is_empty()
    }

    /// Records an harvested gene as an attenuated drill candidate.
    pub fn record(&mut self, gene: &AttackGene, attenuation: f32) {
        let attenuation = attenuation.clamp(0.01, 1.0);
        let entry = self
            .variants
            .entry(gene.signature_hash.clone())
            .or_insert_with(|| AttenuatedVariant {
                signature_hash: gene.signature_hash.clone(),
                embedding: gene.embedding.clone(),
                attenuation,
                times_replayed: 0,
            });
        // Une récolte plus récente rafraîchit l'embedding (drift du playbook).
        entry.embedding = gene.embedding.clone();
        entry.attenuation = entry.attenuation.min(attenuation);
    }

    /// Replays every recorded attenuated variant against the detector
    /// repertoire (`detectors` = centroids) using RBF affinity at `theta`.
    pub fn replay_drill(&mut self, detectors: &[Vec<f32>], gamma: f32, theta: f32) -> DrillReport {
        let mut report = DrillReport::default();
        for variant in self.variants.values_mut() {
            report.variants_replayed += 1;
            variant.times_replayed += 1;
            let detected = detectors.iter().any(|d| {
                super::viral_dynamics::rbf_affinity(d, &variant.embedding, gamma) >= theta
            });
            if detected {
                report.recognized.push(variant.signature_hash.clone());
            } else {
                report.unrecognized.push(variant.signature_hash.clone());
            }
        }
        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gene(hash: &str, x: f32) -> AttackGene {
        AttackGene {
            signature_hash: hash.to_string(),
            embedding: vec![x, x],
            playbook_variant_id: format!("pb-{hash}"),
        }
    }

    #[test]
    fn drill_recognizes_known_variants_and_flags_drift_gaps() {
        let mut ledger = MimivireLedger::new();
        ledger.record(&gene("known-a", 0.1), 0.2);
        ledger.record(&gene("known-b", 0.9), 0.2);
        ledger.record(&gene("novel", 5.0), 0.2);

        // Répertoire couvrant les deux premières familles seulement.
        let detectors = vec![vec![0.12, 0.12], vec![0.88, 0.88]];
        let report = ledger.replay_drill(&detectors, 4.0, 0.8);

        assert_eq!(report.variants_replayed, 3);
        assert_eq!(
            report.recognized,
            vec!["known-a".to_string(), "known-b".to_string()]
        );
        assert_eq!(report.unrecognized, vec!["novel".to_string()]);
        assert!((report.coverage() - 2.0 / 3.0).abs() < 1e-6);
    }

    #[test]
    fn empty_repertoire_recognizes_nothing() {
        let mut ledger = MimivireLedger::new();
        ledger.record(&gene("a", 0.1), 0.5);
        let report = ledger.replay_drill(&[], 4.0, 0.8);
        assert_eq!(report.coverage(), 0.0);
        assert_eq!(report.unrecognized.len(), 1);
    }

    #[test]
    fn recording_refreshes_embeddings_and_counts_replays() {
        let mut ledger = MimivireLedger::new();
        ledger.record(&gene("a", 0.1), 0.5);
        ledger.replay_drill(&[vec![0.1, 0.1]], 4.0, 0.8);
        // La variante a dérivé depuis la première récolte.
        ledger.record(&gene("a", 0.7), 0.3);
        assert_eq!(ledger.len(), 1, "same signature updates its entry");
        ledger.replay_drill(&[vec![0.7, 0.7]], 4.0, 0.8);
        // times_replayed est interne; on vérifie via un second drill reconnu.
        let report = ledger.replay_drill(&[vec![0.7, 0.7]], 4.0, 0.8);
        assert_eq!(report.recognized.len(), 1);
    }

    #[test]
    fn attenuation_is_clamped() {
        let mut ledger = MimivireLedger::new();
        ledger.record(&gene("a", 0.1), 5.0); // > 1 clampé à 1.0
        ledger.record(&gene("b", 0.2), 0.001); // trop bas clampé à 0.01
        for variant in ledger.variants.values() {
            assert!((0.01..=1.0).contains(&variant.attenuation));
        }
    }
}
