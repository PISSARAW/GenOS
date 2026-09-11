use serde::{Deserialize, Serialize};

/// Impulsion ultrasonore active (chirp FM modulé en fréquence)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UltrasonicPulse {
    pub frequency_khz: f64,
    pub bandwidth_khz: f64,
    pub duration_ms: f64,
    pub intensity_db: f64,
}

impl Default for UltrasonicPulse {
    fn default() -> Self {
        Self {
            frequency_khz: 60.0,
            bandwidth_khz: 25.0,
            duration_ms: 4.0,
            intensity_db: 110.0,
        }
    }
}

/// Signal d'écho retourné par une cible ou un nœud de l'environnement
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EchoReturn {
    pub target_locus: String,
    pub time_of_flight_ms: f64,
    pub doppler_shift_hz: f64,
    pub attenuation_db: f64,
}

/// Nœud spatial 3D reconstruit par le cortex d'écholocation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpatialEchoNode {
    pub locus: String,
    pub distance_meters: f64,
    pub radial_velocity_mps: f64,
    pub relative_density: f64,
    pub is_approaching: bool,
    pub is_obstacle: bool,
    pub spatial_resolution_mm: f64,
}

/// Carte topologique 3D issue du balayage d'écholocation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EcholocationMap {
    pub pulse_frequency_khz: f64,
    pub echo_count: usize,
    pub spatial_depth_meters: f64,
    pub nearest_obstacle: Option<String>,
    pub high_velocity_nodes: Vec<String>,
    pub echo_nodes: Vec<SpatialEchoNode>,
    pub navigable_corridors_count: usize,
}

/// Cortex d'écholocation hypertrophié (modèle microchiroptère / odontocète)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcholocationCortex {
    pub base_frequency_khz: f64,
    pub chirp_rate_hz: f64,
    pub speed_of_sound_mps: f64,
    pub obstacle_distance_threshold_m: f64,
    pub chirps_emitted_count: usize,
}

impl Default for EcholocationCortex {
    fn default() -> Self {
        Self::new(60.0, 150.0, 340.0, 2.5)
    }
}

impl EcholocationCortex {
    pub fn new(
        base_freq_khz: f64,
        chirp_rate_hz: f64,
        speed_of_sound_mps: f64,
        obstacle_threshold_m: f64,
    ) -> Self {
        Self {
            base_frequency_khz: base_freq_khz.max(20.0),
            chirp_rate_hz: chirp_rate_hz.max(1.0),
            speed_of_sound_mps: speed_of_sound_mps.max(100.0),
            obstacle_distance_threshold_m: obstacle_threshold_m.max(0.1),
            chirps_emitted_count: 0,
        }
    }

    /// Émet un chirp ultrasonore calibré
    pub fn emit_chirp(&mut self, bandwidth_khz: f64, duration_ms: f64) -> UltrasonicPulse {
        self.chirps_emitted_count += 1;
        UltrasonicPulse {
            frequency_khz: self.base_frequency_khz,
            bandwidth_khz: bandwidth_khz.max(5.0),
            duration_ms: duration_ms.max(0.5),
            intensity_db: 115.0,
        }
    }

    /// Traite les échos reçus pour reconstruire la topologie spatiale et la cinématique Doppler
    pub fn process_echoes(
        &mut self,
        pulse: &UltrasonicPulse,
        echoes: &[EchoReturn],
    ) -> EcholocationMap {
        self.chirps_emitted_count += 1;

        if echoes.is_empty() {
            return EcholocationMap {
                pulse_frequency_khz: pulse.frequency_khz,
                echo_count: 0,
                spatial_depth_meters: 0.0,
                nearest_obstacle: None,
                high_velocity_nodes: Vec::new(),
                echo_nodes: Vec::new(),
                navigable_corridors_count: 0,
            };
        }

        let wavelength_m = self.speed_of_sound_mps / (pulse.frequency_khz * 1000.0);
        let mut nodes = Vec::new();
        let mut max_depth = 0.0;
        let mut nearest_obs: Option<(String, f64)> = None;
        let mut high_velocity = Vec::new();

        for echo in echoes {
            // Distance = (v * Delta t) / 2
            let tof_seconds = (echo.time_of_flight_ms / 1000.0).max(0.0);
            let distance_m = (self.speed_of_sound_mps * tof_seconds) / 2.0;

            if distance_m > max_depth {
                max_depth = distance_m;
            }

            // Vitesse radiale Doppler: v = (Delta f * c) / (2 * f0)
            let f0 = pulse.frequency_khz * 1000.0;
            let velocity_mps = if f0 > 0.0 {
                (echo.doppler_shift_hz * self.speed_of_sound_mps) / (2.0 * f0)
            } else {
                0.0
            };

            let is_approaching = echo.doppler_shift_hz > 0.0;
            let is_obstacle = distance_m <= self.obstacle_distance_threshold_m;

            // Densité relative dérivée de l'atténuation (0..1)
            let remaining_db = (pulse.intensity_db - echo.attenuation_db).max(0.0);
            let relative_density = (remaining_db / pulse.intensity_db.max(1.0)).clamp(0.0, 1.0);

            // Résolution spatiale = lambda / 2 (en mm)
            let resolution_mm = (wavelength_m * 1000.0) / 2.0;

            if is_obstacle {
                match &nearest_obs {
                    Some((_, d)) if distance_m < *d => {
                        nearest_obs = Some((echo.target_locus.clone(), distance_m));
                    }
                    None => {
                        nearest_obs = Some((echo.target_locus.clone(), distance_m));
                    }
                    _ => {}
                }
            }

            if velocity_mps.abs() >= 1.0 {
                high_velocity.push(echo.target_locus.clone());
            }

            nodes.push(SpatialEchoNode {
                locus: echo.target_locus.clone(),
                distance_meters: (distance_m * 1000.0).round() / 1000.0,
                radial_velocity_mps: (velocity_mps * 1000.0).round() / 1000.0,
                relative_density: (relative_density * 1000.0).round() / 1000.0,
                is_approaching,
                is_obstacle,
                spatial_resolution_mm: (resolution_mm * 1000.0).round() / 1000.0,
            });
        }

        // Tri par distance croissante
        nodes.sort_by(|a, b| a.distance_meters.partial_cmp(&b.distance_meters).unwrap_or(std::cmp::Ordering::Equal));

        let navigable_corridors = nodes.iter().filter(|n| !n.is_obstacle).count();

        EcholocationMap {
            pulse_frequency_khz: pulse.frequency_khz,
            echo_count: nodes.len(),
            spatial_depth_meters: (max_depth * 1000.0).round() / 1000.0,
            nearest_obstacle: nearest_obs.map(|(locus, _)| locus),
            high_velocity_nodes: high_velocity,
            echo_nodes: nodes,
            navigable_corridors_count: navigable_corridors,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_echolocation_doppler_and_distance() {
        let mut cortex = EcholocationCortex::new(80.0, 200.0, 340.0, 2.0);
        let pulse = cortex.emit_chirp(20.0, 3.0);

        let echoes = vec![
            EchoReturn {
                target_locus: "branch/feature_auth".to_string(),
                time_of_flight_ms: 10.0, // distance = 340 * 0.01 / 2 = 1.7 m (obstacle < 2.0m)
                doppler_shift_hz: 500.0, // approche active
                attenuation_db: 20.0,
            },
            EchoReturn {
                target_locus: "db/deadlock_risk".to_string(),
                time_of_flight_ms: 40.0, // distance = 340 * 0.04 / 2 = 6.8 m (corridor dégagé)
                doppler_shift_hz: -100.0, // éloignement
                attenuation_db: 45.0,
            },
        ];

        let map = cortex.process_echoes(&pulse, &echoes);
        assert_eq!(map.echo_count, 2);
        assert_eq!(map.nearest_obstacle, Some("branch/feature_auth".to_string()));
        assert_eq!(map.navigable_corridors_count, 1);
        assert!(map.echo_nodes[0].is_obstacle);
        assert!(map.echo_nodes[0].is_approaching);
        assert_eq!(map.echo_nodes[0].distance_meters, 1.7);
    }
}
