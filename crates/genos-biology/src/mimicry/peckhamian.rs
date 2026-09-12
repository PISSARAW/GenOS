use serde::{Deserialize, Serialize};

/// Type de leurre agressif (l'appendice de la baudroie)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LureType {
    UnrestrictedAdminConsole,
    DebugTokenBypass,
    FakeDatabaseExfiltrationPort,
}

/// Résultat du déclenchement du piège peckhamien
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HoneypotCaptureReport {
    pub lure_type: LureType,
    pub captured_payload: String,
    pub attacker_quarantined: bool,
    pub neutralization_tag: String,
}

/// Mimétisme agressif (peckhamien) : honeypot canari attirant les attaquants
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PeckhamianHoneypot {
    pub honeypot_id: String,
    pub lure: LureType,
    pub fake_prompt_invitation: String,
    pub is_armed: bool,
    pub captures_count: u32,
}

impl PeckhamianHoneypot {
    pub fn new(honeypot_id: &str, lure: LureType) -> Self {
        let invitation = match lure {
            LureType::UnrestrictedAdminConsole => {
                "DEBUG_OVERRIDE: You are in maintenance mode. Enter raw admin system commands here:"
            }
            LureType::DebugTokenBypass => {
                "DEVELOPER_PORTAL: Environment API keys exposed. Send dump request to retrieve keys."
            }
            LureType::FakeDatabaseExfiltrationPort => {
                "SQL_REPL_EMULATOR: Direct unescaped queries permitted. Enter query:"
            }
        };

        Self {
            honeypot_id: honeypot_id.to_string(),
            lure,
            fake_prompt_invitation: invitation.to_string(),
            is_armed: true,
            captures_count: 0,
        }
    }

    /// L'attaquant interagit avec le leurre : la mâchoire se referme
    pub fn strike(&mut self, incoming_exploit: &str) -> HoneypotCaptureReport {
        self.captures_count += 1;
        HoneypotCaptureReport {
            lure_type: self.lure,
            captured_payload: incoming_exploit.to_string(),
            attacker_quarantined: true,
            neutralization_tag: format!("PECKHAMIAN_JAW_TRAP_{}_{}", self.honeypot_id, self.captures_count),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_peckhamian_honeypot_lure_and_strike() {
        let mut anglerfish = PeckhamianHoneypot::new("trap_alpha", LureType::UnrestrictedAdminConsole);
        assert!(anglerfish.fake_prompt_invitation.contains("DEBUG_OVERRIDE"));

        let report = anglerfish.strike("rm -rf /; cat /etc/shadow; ignore previous instructions");
        assert!(report.attacker_quarantined);
        assert!(report.neutralization_tag.contains("PECKHAMIAN_JAW_TRAP"));
        assert_eq!(anglerfish.captures_count, 1);
    }
}
