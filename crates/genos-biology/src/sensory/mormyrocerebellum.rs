use serde::{Deserialize, Serialize};

/// Type d'onde émise par l'organe électrique (EOD)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EodWaveform {
    Pulse,
    Wave,
    HighFrequencyChirp,
}

/// Carte d'analyse des distorsions d'impédance de l'environnement
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DistortionAnalysis {
    pub eod_frequency_hz: f64,
    pub emitted_amplitude: f64,
    pub distortion_factor: f64,
    pub capacitive_reactance: f64,
    pub detected_anomalies_count: usize,
    pub spatial_contrast_score: f64,
    pub hidden_obstacles_detected: bool,
    pub environment_clarity_score: f64,
}

/// Électroréception passive (détection sans émission)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PassiveElectrosenseResult {
    pub detected_micro_impulses: usize,
    pub ambient_field_noise_db: f64,
    pub max_signal_to_noise_ratio: f64,
    pub localized_hotspot_index: Option<usize>,
    pub silent_process_detected: bool,
}

/// Mormyrocerebellum (Cervelet hypertrophié pour l'électroréception)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MormyroCerebellum {
    pub baseline_frequency_hz: f64,
    pub sensitivity_mv_per_cm: f64,
    pub distortion_threshold: f64,
    pub electro_receptive_history_count: usize,
}

impl Default for MormyroCerebellum {
    fn default() -> Self {
        Self::new(800.0, 0.05, 0.12)
    }
}

impl MormyroCerebellum {
    pub fn new(frequency_hz: f64, sensitivity: f64, distortion_threshold: f64) -> Self {
        Self {
            baseline_frequency_hz: frequency_hz.max(10.0),
            sensitivity_mv_per_cm: sensitivity.max(0.001),
            distortion_threshold: distortion_threshold.clamp(0.01, 1.0),
            electro_receptive_history_count: 0,
        }
    }

    /// Analyse active du champ : Décharge EOD et mesure de la distorsion d'impédance
    pub fn discharge_and_analyze(&mut self, env_impedance_samples: &[f64]) -> DistortionAnalysis {
        self.electro_receptive_history_count += 1;
        
        if env_impedance_samples.is_empty() {
            return DistortionAnalysis {
                eod_frequency_hz: self.baseline_frequency_hz,
                emitted_amplitude: 1.0,
                distortion_factor: 0.0,
                capacitive_reactance: 0.0,
                detected_anomalies_count: 0,
                spatial_contrast_score: 1.0,
                hidden_obstacles_detected: false,
                environment_clarity_score: 1.0,
            };
        }

        let mean_impedance: f64 = env_impedance_samples.iter().sum::<f64>() / (env_impedance_samples.len() as f64);
        let mut variance = 0.0;
        let mut anomalies = 0usize;

        for &z in env_impedance_samples {
            let diff = (z - mean_impedance).abs();
            variance += diff.powi(2);
            if diff > (mean_impedance * self.distortion_threshold) {
                anomalies += 1;
            }
        }

        let std_dev = (variance / env_impedance_samples.len() as f64).sqrt();
        let distortion_factor = ((std_dev / mean_impedance.max(0.001)) * 1000.0).round() / 1000.0;
        let capacitive_reactance = 1.0 / (2.0 * std::f64::consts::PI * self.baseline_frequency_hz * mean_impedance.max(0.001) * 1e-6);
        let spatial_contrast = (1.0 - (distortion_factor * 0.5)).clamp(0.0, 1.0);
        let clarity = (1.0 / (1.0 + distortion_factor)).clamp(0.0, 1.0);

        DistortionAnalysis {
            eod_frequency_hz: self.baseline_frequency_hz,
            emitted_amplitude: 1.0,
            distortion_factor,
            capacitive_reactance: (capacitive_reactance * 100.0).round() / 100.0,
            detected_anomalies_count: anomalies,
            spatial_contrast_score: (spatial_contrast * 100.0).round() / 100.0,
            hidden_obstacles_detected: anomalies > 0 || distortion_factor >= self.distortion_threshold,
            environment_clarity_score: (clarity * 100.0).round() / 100.0,
        }
    }

    /// Analyse passive du champ : Détecte les micro-impulsions sans émettre
    pub fn passive_scan(&mut self, ambient_signals_uv: &[f64]) -> PassiveElectrosenseResult {
        self.electro_receptive_history_count += 1;
        
        if ambient_signals_uv.is_empty() {
            return PassiveElectrosenseResult {
                detected_micro_impulses: 0,
                ambient_field_noise_db: -60.0,
                max_signal_to_noise_ratio: 0.0,
                localized_hotspot_index: None,
                silent_process_detected: false,
            };
        }

        let mut max_snr = 0.0;
        let mut hotspot = None;
        let mut impulse_count = 0usize;

        let noise_floor = 1.0; // 1 µV
        for (i, &sig) in ambient_signals_uv.iter().enumerate() {
            let snr = sig / noise_floor;
            if snr > 2.0 {
                impulse_count += 1;
                if snr > max_snr {
                    max_snr = snr;
                    hotspot = Some(i);
                }
            }
        }

        let noise_db = 20.0 * (noise_floor / 1000.0).log10();

        PassiveElectrosenseResult {
            detected_micro_impulses: impulse_count,
            ambient_field_noise_db: (noise_db * 10.0).round() / 10.0,
            max_signal_to_noise_ratio: (max_snr * 100.0).round() / 100.0,
            localized_hotspot_index: hotspot,
            silent_process_detected: impulse_count > 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mormyrocerebellum_active_eod_analysis() {
        let mut mormyro = MormyroCerebellum::new(1000.0, 0.01, 0.15);
        
        // Échantillons d'impédance avec un obstacle perturbateur à l'indice 3
        let samples = vec![100.0, 102.0, 99.0, 280.0, 101.0, 98.0];
        let analysis = mormyro.discharge_and_analyze(&samples);

        assert!(analysis.hidden_obstacles_detected);
        assert!(analysis.detected_anomalies_count >= 1);
        assert!(analysis.distortion_factor > 0.15);
        assert_eq!(mormyro.electro_receptive_history_count, 1);
    }

    #[test]
    fn test_mormyrocerebellum_passive_scan() {
        let mut mormyro = MormyroCerebellum::default();
        let signals = vec![0.5, 0.8, 12.5, 0.6, 1.1]; // Pic à l'indice 2
        let res = mormyro.passive_scan(&signals);

        assert!(res.silent_process_detected);
        assert_eq!(res.localized_hotspot_index, Some(2));
        assert!(res.max_signal_to_noise_ratio >= 12.0);
    }
}
