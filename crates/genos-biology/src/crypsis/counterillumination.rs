use serde::{Deserialize, Serialize};

/// Photophore de compensation de contre-illumination
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PhotophoreState {
    pub ambient_luminance: f64,  // Niveau de bruit / trafic ambiant (lux équivalent)
    pub emission_intensity: f64, // Émission active du photophore
    pub ventral_balance: f64,   // Équilibre résiduel [proche de 0.0 = contraste nul]
}

/// Contre-illumination computationnelle : compensation d'entropie et lissage de flux
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Counterillumination {
    pub target_ambient_rate: f64, // Débit de référence du milieu (ex: 50.0 tokens/s ou 100 msg/min)
    pub current_photophore: PhotophoreState,
}

impl Counterillumination {
    pub fn new(target_ambient_rate: f64) -> Self {
        Self {
            target_ambient_rate,
            current_photophore: PhotophoreState {
                ambient_luminance: target_ambient_rate,
                emission_intensity: 0.0,
                ventral_balance: 0.0,
            },
        }
    }

    /// Calibre les photophores ventraux pour égaliser le flux émis au flux ambiant
    pub fn compensate_traffic(&mut self, actual_rate: f64) -> (f64, String) {
        let delta = self.target_ambient_rate - actual_rate;

        let (chaffing_emission, mode) = if delta > 0.0 {
            // Trafic trop faible : la silhouette sombre trahit un vide -> injection de bioluminescence (chaffing padding)
            (delta, format!("PADDING_CHAFF: +{:.1} synthetic_tokens", delta))
        } else if delta < 0.0 {
            // Trafic trop fort : la silhouette brillante trahit un pic -> atténuation temporelle
            (0.0, format!("THROTTLE_DAMPENING: {:.1} delay_ms", delta.abs() * 10.0))
        } else {
            (0.0, "PERFECT_MATCH: 0.0 variance".to_string())
        };

        self.current_photophore.ambient_luminance = self.target_ambient_rate;
        self.current_photophore.emission_intensity = chaffing_emission;
        let residual = ((actual_rate + chaffing_emission) - self.target_ambient_rate).abs();
        self.current_photophore.ventral_balance = residual / self.target_ambient_rate.max(1.0);

        (self.current_photophore.ventral_balance, mode)
    }

    /// Indique si la silhouette contre-illuminée est indétectable par un capteur externe
    pub fn is_cloaked(&self) -> bool {
        self.current_photophore.ventral_balance < 0.05
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_counterillumination_photophore_padding() {
        let mut counter = Counterillumination::new(100.0);
        // L'agent n'émet que 60.0 -> silhouette sombre
        let (contrast, mode) = counter.compensate_traffic(60.0);

        assert!(contrast < 0.01);
        assert!(counter.is_cloaked());
        assert!(mode.contains("PADDING_CHAFF"));
    }

    #[test]
    fn test_counterillumination_exact_match() {
        let mut counter = Counterillumination::new(80.0);
        let (contrast, mode) = counter.compensate_traffic(80.0);

        assert_eq!(contrast, 0.0);
        assert!(counter.is_cloaked());
        assert!(mode.contains("PERFECT_MATCH"));
    }
}
