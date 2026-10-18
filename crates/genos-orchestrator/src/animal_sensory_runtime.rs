use crate::GenosEcosystem;
use genos_biology::sensory::{EchoReturn, PheromoneSignal};
use genos_biology::sensorium::{integrate_verified_signal, SensorModality, Signal, SignalProvenance};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(tag = "sensor", rename_all = "snake_case")]
pub enum SyntheticAnimalSignal {
    Compass { goal: Vec<f64>, current: Vec<f64> },
    ActiveElectroreception { impedance_samples: Vec<f64> },
    PassiveElectroreception { ambient_uv: Vec<f64> },
    Vomeronasal { signal: PheromoneSignal },
    ThermalFusion { visual_nodes: Vec<(String, f64)>, thermal_readings: Vec<(String, f64)> },
    Echolocation { bandwidth_khz: f64, duration_ms: f64, echoes: Vec<EchoReturn> },
    PolarizedVision { angles_deg: Vec<f64>, intensities: Vec<f64> },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SyntheticAnimalObservation {
    pub signal: SyntheticAnimalSignal,
    pub source_id: String,
    pub capture_id: String,
    pub observed_at_epoch_ms: u64,
    pub synthetic: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SyntheticAnimalReceipt {
    pub schema: &'static str,
    pub event_id: Uuid,
    pub origin: &'static str,
    pub signal: SyntheticAnimalSignal,
    pub measurement: Value,
    pub modality: SensorModality,
    pub intensity: f64,
    pub provenance: SignalProvenance,
}

impl SyntheticAnimalSignal {
    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::Compass { goal, current } => validate_compass(goal, current),
            Self::ActiveElectroreception { impedance_samples } => validate_samples(impedance_samples),
            Self::PassiveElectroreception { ambient_uv } => validate_samples(ambient_uv),
            Self::Vomeronasal { signal } => validate_pheromone(signal),
            Self::ThermalFusion { visual_nodes, thermal_readings } => {
                validate_thermal_nodes(visual_nodes)?;
                validate_thermal_nodes(thermal_readings)
            }
            Self::Echolocation { bandwidth_khz, duration_ms, echoes } => {
                validate_echolocation(*bandwidth_khz, *duration_ms, echoes)
            }
            Self::PolarizedVision { angles_deg, intensities } => validate_polarized(angles_deg, intensities),
        }
    }
}

fn validate_polarized(angles: &[f64], intensities: &[f64]) -> Result<(), String> {
    if angles.is_empty() || angles.len() != intensities.len() || angles.len() > 4096
        || angles.iter().zip(intensities).any(|(a, i)| !a.is_finite() || !(-180.0..=180.0).contains(a) || !i.is_finite() || !(0.0..=1.0).contains(i)) {
        return Err("polarized vision samples must be finite, paired and bounded".into());
    }
    Ok(())
}

fn validate_compass(goal: &[f64], current: &[f64]) -> Result<(), String> {
    if goal.len() != current.len() || goal.len() < 2 || goal.len() > 2048 {
        return Err("compass vectors must have equal dimensions between 2 and 2048".into());
    }
    if goal.iter().chain(current).any(|value| !value.is_finite()) {
        return Err("synthetic compass values must be finite".into());
    }
    Ok(())
}

fn validate_samples(samples: &[f64]) -> Result<(), String> {
    if samples.is_empty() || samples.len() > 4096 || samples.iter().any(|value| !value.is_finite()) {
        return Err("synthetic sensor samples must be finite and bounded to 4096 values".into());
    }
    Ok(())
}

fn validate_pheromone(signal: &PheromoneSignal) -> Result<(), String> {
    if invalid_pheromone_identity(signal) || invalid_pheromone_payload(signal) {
        return Err("pheromone signal is invalid or exceeds bounds".into());
    }
    Ok(())
}

fn invalid_pheromone_identity(signal: &PheromoneSignal) -> bool {
    signal.source_agent.is_empty() || signal.source_agent.len() > 256
        || signal.locus.is_empty() || signal.locus.len() > 256
        || !signal.concentration.is_finite() || !(0.0..=1.0).contains(&signal.concentration)
        || !signal.half_life_secs.is_finite() || signal.half_life_secs <= 0.0
}

fn invalid_pheromone_payload(signal: &PheromoneSignal) -> bool {
    signal.subliminal_payload.len() > 64
        || signal.subliminal_payload.iter().any(|(key, value)| key.len() > 256 || value.len() > 1024)
}

fn validate_thermal_nodes(nodes: &[(String, f64)]) -> Result<(), String> {
    if nodes.len() > 1024 || nodes.iter().any(|(locus, value)| {
        locus.is_empty() || locus.len() > 256 || !value.is_finite()
    }) {
        return Err("thermal nodes must have bounded loci and finite scores".into());
    }
    Ok(())
}

fn validate_echolocation(bandwidth: f64, duration: f64, echoes: &[EchoReturn]) -> Result<(), String> {
    let invalid_signal = !bandwidth.is_finite() || !duration.is_finite() || bandwidth <= 0.0 || duration <= 0.0;
    if echoes.len() > 256 || invalid_signal || echoes.iter().any(invalid_echo) {
        return Err("echolocation input is invalid or exceeds bounds".into());
    }
    Ok(())
}

fn invalid_echo(echo: &EchoReturn) -> bool {
    echo.target_locus.is_empty() || echo.target_locus.len() > 256
        || !echo.time_of_flight_ms.is_finite() || echo.time_of_flight_ms < 0.0
        || !echo.doppler_shift_hz.is_finite() || !echo.attenuation_db.is_finite()
}

impl GenosEcosystem {
    /// Traite une lecture animale synthétique explicitement typée et journalise sa preuve.
    pub fn ingest_synthetic_animal_signal(
        &mut self,
        signal: SyntheticAnimalSignal,
    ) -> Result<SyntheticAnimalReceipt, String> {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("clock unavailable: {e}"))?.as_millis() as u64;
        self.ingest_synthetic_animal_observation(SyntheticAnimalObservation {
            signal, source_id: "local-synthetic-adapter".into(), capture_id: Uuid::new_v4().to_string(),
            observed_at_epoch_ms: now, synthetic: true,
        })
    }

    pub fn ingest_synthetic_animal_observation(&mut self, observation: SyntheticAnimalObservation) -> Result<SyntheticAnimalReceipt, String> {
        observation.signal.validate()?;
        if observation.source_id.is_empty() || observation.source_id.len() > 256 || observation.capture_id.is_empty()
            || observation.capture_id.len() > 128 || observation.observed_at_epoch_ms == 0 || !observation.synthetic {
            return Err("synthetic sensor provenance is invalid or not explicitly synthetic".into());
        }
        let signal = observation.signal;
        let measurement = measure_signal(self, &signal)?;
        let modality = signal_modality(&signal);
        let intensity = measurement_intensity(&measurement);
        integrate_verified_signal(&mut self.sensorium, Signal { modality: modality.clone(), intensity, timestamp: Some(observation.observed_at_epoch_ms) }, SignalProvenance {
            source_id: observation.source_id.clone(), capture_id: observation.capture_id.clone(), observed_at_epoch_ms: observation.observed_at_epoch_ms, synthetic: true,
        });
        let payload = serde_json::json!({ "schema": "genos.synthetic-animal-signal/v1", "origin": "synthetic", "signal": &signal, "measurement": &measurement, "modality": modality, "provenance": { "source_id": &observation.source_id, "capture_id": &observation.capture_id, "observed_at_epoch_ms": observation.observed_at_epoch_ms, "synthetic": true } });
        let event_id = self.record_event("SYNTHETIC_ANIMAL_SIGNAL", payload);
        Ok(SyntheticAnimalReceipt {
            schema: "genos.synthetic-animal-receipt/v1",
            event_id,
            origin: "synthetic",
            signal,
            measurement,
            modality,
            intensity,
            provenance: SignalProvenance { source_id: observation.source_id, capture_id: observation.capture_id, observed_at_epoch_ms: observation.observed_at_epoch_ms, synthetic: true },
        })
    }
}

fn measure_signal(ecosystem: &mut GenosEcosystem, signal: &SyntheticAnimalSignal) -> Result<Value, String> {
    let measurement = match signal {
            SyntheticAnimalSignal::Compass { goal, current } => {
                serde_json::to_value(ecosystem.senses.navigate(goal, current))
            }
            SyntheticAnimalSignal::ActiveElectroreception { impedance_samples } => {
                serde_json::to_value(ecosystem.senses.electrolocate(impedance_samples))
            }
            SyntheticAnimalSignal::PassiveElectroreception { ambient_uv } => {
                serde_json::to_value(ecosystem.senses.passive_scan(ambient_uv))
            }
            SyntheticAnimalSignal::Vomeronasal { signal } => {
                serde_json::to_value(ecosystem.olfaction.receive_signal(signal.clone()))
            }
            SyntheticAnimalSignal::ThermalFusion { visual_nodes, thermal_readings } => {
                serde_json::to_value(ecosystem.senses.fuse_thermal(visual_nodes, thermal_readings))
            }
            SyntheticAnimalSignal::Echolocation { bandwidth_khz, duration_ms, echoes } => {
                let pulse = ecosystem.echolocation.emit_chirp(*bandwidth_khz, *duration_ms);
                serde_json::to_value(ecosystem.echolocation.process_echoes(&pulse, echoes))
            }
        SyntheticAnimalSignal::PolarizedVision { angles_deg, intensities } => serde_json::to_value(polarized_measurement(angles_deg, intensities)),
        }
        .map_err(|error| format!("sensor measurement serialization failed: {error}"))?;
    Ok(measurement)
}

fn signal_modality(signal: &SyntheticAnimalSignal) -> SensorModality {
    match signal {
            SyntheticAnimalSignal::Compass { .. } => SensorModality::Magnetic,
            SyntheticAnimalSignal::ActiveElectroreception { .. } | SyntheticAnimalSignal::PassiveElectroreception { .. } => SensorModality::Electrical,
            SyntheticAnimalSignal::Vomeronasal { .. } => SensorModality::Chemical,
            SyntheticAnimalSignal::ThermalFusion { .. } => SensorModality::Thermal,
            SyntheticAnimalSignal::Echolocation { .. } => SensorModality::Acoustic,
            SyntheticAnimalSignal::PolarizedVision { .. } => SensorModality::Polarized,
    }
}

fn measurement_intensity(measurement: &Value) -> f64 {
    measurement.get("urgency_score").or_else(|| measurement.get("distortion_factor"))
            .or_else(|| measurement.get("max_thermal_gradient")).or_else(|| measurement.get("polarization_contrast"))
        .and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 1.0)
}

fn polarized_measurement(angles: &[f64], intensities: &[f64]) -> Value {
    let mean = intensities.iter().sum::<f64>() / intensities.len() as f64;
    let contrast = intensities.iter().map(|v| (v - mean).abs()).sum::<f64>() / intensities.len() as f64;
    serde_json::json!({ "sample_count": angles.len(), "mean_intensity": mean, "polarization_contrast": contrast, "synthetic_only": true })
}

#[cfg(test)]
mod tests {
    use super::{GenosEcosystem, SyntheticAnimalObservation, SyntheticAnimalSignal};
    use genos_biology::sensory::{EchoReturn, PheromoneSignal, PheromoneType};
    use std::collections::HashMap;

    #[test]
    fn synthetic_electrosense_is_measured_and_recorded_with_origin() {
        let mut ecosystem = GenosEcosystem::new("synthetic-sense");
        let receipt = ecosystem
            .ingest_synthetic_animal_signal(SyntheticAnimalSignal::PassiveElectroreception {
                ambient_uv: vec![0.2, 0.5, 0.9],
            })
            .expect("valid synthetic sensor input");

        assert_eq!(receipt.origin, "synthetic");
        assert!(receipt.measurement["detected_micro_impulses"].is_number());
        let event = ecosystem.events.read_stream(1).pop().expect("event persisted in store");
        assert_eq!(event.event_type, "SYNTHETIC_ANIMAL_SIGNAL");
        assert_eq!(event.payload["origin"], "synthetic");
        assert_eq!(event.payload["measurement"]["detected_micro_impulses"], receipt.measurement["detected_micro_impulses"]);
    }

    #[test]
    fn invalid_synthetic_signal_is_rejected_before_runtime_mutation() {
        let mut ecosystem = GenosEcosystem::new("invalid-sense");
        let result = ecosystem.ingest_synthetic_animal_signal(
            SyntheticAnimalSignal::Compass { goal: vec![1.0], current: vec![1.0, 0.0] },
        );
        assert!(result.is_err());
        assert_eq!(ecosystem.events.count(), 0);
    }

    #[test]
    fn typed_vomeronasal_thermal_and_echo_signals_emit_measured_receipts() {
        let mut ecosystem = GenosEcosystem::new("typed-senses");
        let alarm = PheromoneSignal {
            source_agent: "agent-a".into(), locus: "workspace/src".into(),
            pheromone_type: PheromoneType::Alarm, concentration: 0.9, half_life_secs: 60.0,
            timestamp_epoch_ms: 1, subliminal_payload: HashMap::new(),
        };
        let vno = ecosystem.ingest_synthetic_animal_signal(SyntheticAnimalSignal::Vomeronasal { signal: alarm })
            .expect("valid VNO input");
        assert_eq!(vno.measurement["autonomic_action"], "IMMEDIATE_DEFENSIVE_FREEZE_AND_ALERT");

        let thermal = ecosystem.ingest_synthetic_animal_signal(SyntheticAnimalSignal::ThermalFusion {
            visual_nodes: vec![("src/auth.rs".into(), 0.8)],
            thermal_readings: vec![("src/auth.rs".into(), 0.9)],
        }).expect("valid thermal input");
        assert_eq!(thermal.measurement["primary_strike_target"], "src/auth.rs");

        let echo = ecosystem.ingest_synthetic_animal_signal(SyntheticAnimalSignal::Echolocation {
            bandwidth_khz: 20.0, duration_ms: 3.0,
            echoes: vec![EchoReturn { target_locus: "branch/x".into(), time_of_flight_ms: 10.0,
                doppler_shift_hz: 500.0, attenuation_db: 20.0 }],
        }).expect("valid echo input");
        assert_eq!(echo.measurement["nearest_obstacle"], "branch/x");
        assert_eq!(ecosystem.events.count(), 3);
    }

    #[test]
    fn polarized_vision_is_bounded_and_provenanced() {
        let mut ecosystem = GenosEcosystem::new("polarized");
        let receipt = ecosystem.ingest_synthetic_animal_observation(SyntheticAnimalObservation {
            signal: SyntheticAnimalSignal::PolarizedVision { angles_deg: vec![-45.0, 0.0, 45.0], intensities: vec![0.2, 0.8, 0.4] },
            source_id: "test-adapter".into(), capture_id: "capture-1".into(), observed_at_epoch_ms: 42, synthetic: true,
        }).expect("valid synthetic polarized observation");
        assert_eq!(receipt.modality, genos_biology::sensorium::SensorModality::Polarized);
        assert!(receipt.provenance.synthetic);
        assert_eq!(ecosystem.sensorium.observations.len(), 1);
    }
}
