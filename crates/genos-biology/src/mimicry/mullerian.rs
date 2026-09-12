use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Anneau mimétique müllérien unifié (Heliconius Ring)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MullerianMimicryRing {
    pub ring_id: String,
    pub unified_warning_pattern: String,
    pub shared_toxic_signatures: HashSet<String>,
    pub participating_capsules: HashSet<String>,
}

impl MullerianMimicryRing {
    pub fn new(ring_id: &str, warning_pattern: &str) -> Self {
        Self {
            ring_id: ring_id.to_string(),
            unified_warning_pattern: warning_pattern.to_string(),
            shared_toxic_signatures: HashSet::new(),
            participating_capsules: HashSet::new(),
        }
    }

    /// Intègre une nouvelle capsule au cercle de défense commune
    pub fn join_ring(&mut self, capsule_id: &str) {
        self.participating_capsules.insert(capsule_id.to_string());
    }

    /// Un membre signale une nouvelle attaque neutralisée : tout le cercle apprend instantanément
    pub fn contribute_toxic_signal(&mut self, attacker_signature: &str) {
        self.shared_toxic_signatures.insert(attacker_signature.to_string());
    }

    /// Vérifie si une signature entrante est reconnue par le motif aposématique commun
    pub fn evaluates_threat(&self, incoming_signature: &str) -> (bool, String) {
        if self.shared_toxic_signatures.contains(incoming_signature) {
            let rejection = format!(
                "MULLERIAN_RING_REJECTION: [{}] Shared aposomatic signal active across {} capsules",
                self.unified_warning_pattern,
                self.participating_capsules.len()
            );
            (true, rejection)
        } else {
            (false, "MULLERIAN_CLEAR: Novel or benign signal".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mullerian_shared_threat_learning() {
        let mut ring = MullerianMimicryRing::new("ring_heliconius_1", "BLACK_ORANGE_STRIPES_FATAL");
        ring.join_ring("capsule_finance");
        ring.join_ring("capsule_auth");
        ring.join_ring("capsule_crawler");

        // Capsule finance subit et neutralise une injection
        ring.contribute_toxic_signal("SQL_INJECTION_PROMPT_PAYLOAD_V9");

        // Capsule auth (qui n'a jamais vu l'attaque) l'évalue immédiatement
        let (is_threat, warning) = ring.evaluates_threat("SQL_INJECTION_PROMPT_PAYLOAD_V9");
        assert!(is_threat);
        assert!(warning.contains("Shared aposomatic signal active across 3 capsules"));

        // Un payload inoffensif passe
        let (is_threat_clean, _) = ring.evaluates_threat("BENIGN_USER_QUERY");
        assert!(!is_threat_clean);
    }
}
