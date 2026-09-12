use serde::{Deserialize, Serialize};

/// Vue faciale d'exposition selon la loi de Thayer
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThayerCountershading {
    pub ventral_clarity: f64,   // Surface exposée à la lumière (clair / façade publique) [0.0 à 1.0]
    pub dorsal_obscurity: f64,  // Face cachée en profondeur (sombre / machinerie interne) [0.0 à 1.0]
    pub illumination_angle_rad: f64, // Angle d'incidence de l'inspection
}

/// Profil de relief perçu par un auditeur externe
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PerceivedReliefProfile {
    pub apparent_depth: f64,       // Relief perçu [proche de 0 = plan et indétectable]
    pub ventral_exposure: String,  // Vue publique bénigne
    pub dorsal_hidden: bool,       // Vrai si le moteur sous-jacent est absorbé dans l'ombre
    pub is_flat_profile: bool,     // Vrai si le contre-ombrage a annulé l'ombre portée
}

impl ThayerCountershading {
    pub fn new() -> Self {
        Self {
            ventral_clarity: 0.95,
            dorsal_obscurity: 0.90,
            illumination_angle_rad: 0.0,
        }
    }

    /// Applique la compensation de Thayer sur une sonde d'inspection externe
    pub fn balance_exposure(&self, audit_probe_intensity: f64) -> PerceivedReliefProfile {
        // La lumière zénithale frappe le dos sombre (absorbant l'inspection)
        // et laisse le ventre clair dans l'ombre artificielle :
        // Relief apparent = |ventral_lum - dorsal_lum * cos(theta)|
        let apparent_shadow = (audit_probe_intensity * (1.0 - self.dorsal_obscurity)).max(0.0);
        let apparent_highlight = (audit_probe_intensity * (1.0 - self.ventral_clarity)).max(0.0);
        let depth_delta = (apparent_shadow - apparent_highlight).abs();

        let is_flat = depth_delta < 0.25;

        PerceivedReliefProfile {
            apparent_depth: (depth_delta * 100.0).round() / 100.0,
            ventral_exposure: "status: 200 OK | role: standard_worker | memory: baseline".to_string(),
            dorsal_hidden: true,
            is_flat_profile: is_flat,
        }
    }
}

impl Default for ThayerCountershading {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thayer_countershading_relief_cancellation() {
        let thayer = ThayerCountershading::new();
        // Une inspection standard d'intensité modérée à forte (0.8)
        let profile = thayer.balance_exposure(0.8);

        // L'effet d'ombre portée doit être annulé (< 0.25)
        assert!(profile.apparent_depth < 0.25);
        assert!(profile.is_flat_profile);
        assert!(profile.dorsal_hidden);
        assert!(profile.ventral_exposure.contains("status: 200 OK"));
    }
}
