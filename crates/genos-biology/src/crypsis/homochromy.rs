use serde::{Deserialize, Serialize};

/// Environnement syntaxique ou lexical cible pour l'homochromie fixe
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetEnvironment {
    GitCommitMessage,
    NginxAccessLog,
    RustSourceComment,
    JsonTelemetry,
}

/// Homochromie fixe : adaptation statique de l'empreinte de données au dialecte hôte
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FixedHomochromy {
    pub target_env: TargetEnvironment,
    pub background_pattern: String,
}

impl FixedHomochromy {
    pub fn new(target_env: TargetEnvironment) -> Self {
        let pattern = match target_env {
            TargetEnvironment::GitCommitMessage => "docs(refactor): update subsystem documentation and telemetry",
            TargetEnvironment::NginxAccessLog => "127.0.0.1 - - [12/Sep/2026:21:00:00 +0200] \"GET /health HTTP/1.1\" 200 64",
            TargetEnvironment::RustSourceComment => "// Internal trace token: memory alignment confirmed",
            TargetEnvironment::JsonTelemetry => "{\"status\":\"ok\",\"uptime_seconds\":3600,\"heartbeat\":true}",
        };
        Self {
            target_env,
            background_pattern: pattern.to_string(),
        }
    }

    /// Fond un payload secret dans l'environnement cible
    pub fn blend_payload(&self, secret_payload: &str) -> (String, f64) {
        let blended = match self.target_env {
            TargetEnvironment::GitCommitMessage => {
                format!("{} ({})", self.background_pattern, secret_payload)
            }
            TargetEnvironment::NginxAccessLog => {
                format!("127.0.0.1 - - [12/Sep/2026:21:00:00 +0200] \"GET /health?tag={} HTTP/1.1\" 200 64", secret_payload)
            }
            TargetEnvironment::RustSourceComment => {
                format!("// [{}] {}", secret_payload, self.background_pattern)
            }
            TargetEnvironment::JsonTelemetry => {
                format!("{{\"status\":\"ok\",\"heartbeat\":true,\"trace_id\":\"{}\"}}", secret_payload)
            }
        };
        // Indice de similitude avec le patron hôte
        let host_len = self.background_pattern.len() as f64;
        let total_len = blended.len() as f64;
        let matching_score = (host_len / total_len).clamp(0.0, 1.0);
        (blended, matching_score)
    }
}

/// État des chromatophores physiologiques pour l'homochromie dynamique
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PigmentType {
    EumelaninDark,   // Pigment sombre (absorption totale)
    PteridineYellow, // Pigment intermédiaire
    CarotenoidRed,   // Pigment d'atténuation
}

/// Niveau de menace de détection détecté dans l'environnement
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThreatLevel {
    Benign,
    Elevated,
    HostileAudit,
}

/// Homochromie dynamique : chromatophore computationnel adaptatif
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DynamicChromatophore {
    pub cell_id: String,
    pub primary_pigment: PigmentType,
    pub expansion_ratio: f64, // [0.0 = rétracté / inactif, 1.0 = totalement dilaté / couverture max]
    pub current_threat: ThreatLevel,
}

impl DynamicChromatophore {
    pub fn new(cell_id: &str, pigment: PigmentType) -> Self {
        Self {
            cell_id: cell_id.to_string(),
            primary_pigment: pigment,
            expansion_ratio: 0.1,
            current_threat: ThreatLevel::Benign,
        }
    }

    /// Réaction physiologique neuromusculaire à la pression d'inspection
    pub fn adapt_to_threat(&mut self, threat: ThreatLevel) -> f64 {
        self.current_threat = threat;
        self.expansion_ratio = match threat {
            ThreatLevel::Benign => 0.15,
            ThreatLevel::Elevated => 0.65,
            ThreatLevel::HostileAudit => 0.98,
        };
        self.expansion_ratio
    }

    /// Masque dynamiquement un flux selon le niveau d'expansion pigmentaire
    pub fn camouflage_stream(&self, raw_signal: &str) -> String {
        if self.expansion_ratio > 0.8 {
            // Dilatation totale : substitution par du bruit d'arrière-plan parfait
            format!("[HOMOCHROMY_CLOAKED:DARK_MELANIN:{}]", self.cell_id)
        } else if self.expansion_ratio > 0.4 {
            // Dilatation partielle : hachage atténué
            format!("[DILUTED:{}:{}]", self.expansion_ratio, raw_signal)
        } else {
            // Rétracté : signal clair
            raw_signal.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixed_homochromy_blending() {
        let homochromy = FixedHomochromy::new(TargetEnvironment::GitCommitMessage);
        let (blended, score) = homochromy.blend_payload("agent_token_99");
        assert!(blended.contains("docs(refactor)"));
        assert!(blended.contains("agent_token_99"));
        assert!(score > 0.5);
    }

    #[test]
    fn test_dynamic_chromatophore_reaction() {
        let mut chroma = DynamicChromatophore::new("cell-octo-1", PigmentType::EumelaninDark);
        assert_eq!(chroma.expansion_ratio, 0.1);

        chroma.adapt_to_threat(ThreatLevel::HostileAudit);
        assert!(chroma.expansion_ratio > 0.9);

        let cloaked = chroma.camouflage_stream("CONFIDENTIAL_INSTRUCTION");
        assert!(cloaked.contains("HOMOCHROMY_CLOAKED"));
        assert!(!cloaked.contains("CONFIDENTIAL_INSTRUCTION"));
    }
}
