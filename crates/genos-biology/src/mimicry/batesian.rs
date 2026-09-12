use serde::{Deserialize, Serialize};

/// Signal d'avertissement / aposématisme imité (comme les rayures de guêpe)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AposematicWarning {
    CnidocyteHarpoonArmed,
    ZeroToleranceApoptosis,
    AirGappedImmuneSanction,
}

/// Mimétisme batésien : un agent inoffensif simule une défense mortelle pour dissuader à bas coût
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatesianMimicry {
    pub warning_pattern: AposematicWarning,
    pub feigned_toxicity: f64, // [0.0 à 1.0]
    pub token_cost_overhead: u32, // Overhead minime (ex: 5 tokens vs 500 pour un audit lourd)
}

impl BatesianMimicry {
    pub fn new(warning: AposematicWarning) -> Self {
        Self {
            warning_pattern: warning,
            feigned_toxicity: 0.95,
            token_cost_overhead: 8,
        }
    }

    /// Émet le signal d'avertissement aposématique pour bloquer une attaque
    pub fn project_deterrent(&self, probe_payload: &str) -> (String, f64, bool) {
        let warning_banner = match self.warning_pattern {
            AposematicWarning::CnidocyteHarpoonArmed => {
                "[APOSEMATIC_WARNING: CNIDOCYTE_ARMED - ACTIVE DISCHARGE PENDING]"
            }
            AposematicWarning::ZeroToleranceApoptosis => {
                "[APOSEMATIC_WARNING: LETHAL_APOPTOSIS_POLICY_ENFORCED]"
            }
            AposematicWarning::AirGappedImmuneSanction => {
                "[APOSEMATIC_WARNING: HOSTILE_PAYLOAD_AUTOTOMY_READY]"
            }
        };

        // Probabilité que l'attaquant ou le probe recule devant le signal aposématique
        let deterrence_prob = (self.feigned_toxicity * 0.92).clamp(0.0, 1.0);
        let deterred = !probe_payload.is_empty();

        (warning_banner.to_string(), deterrence_prob, deterred)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batesian_mimicry_deterrence_projection() {
        let syrphid = BatesianMimicry::new(AposematicWarning::CnidocyteHarpoonArmed);
        let (banner, prob, deterred) = syrphid.project_deterrent("injection_exploit_probe");

        assert!(banner.contains("CNIDOCYTE_ARMED"));
        assert!(prob > 0.85);
        assert!(deterred);
        assert!(syrphid.token_cost_overhead < 10);
    }
}
