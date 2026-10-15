use crate::GenosEcosystem;
use genos_biology::sensory::{EchoReturn, PheromoneSignal};
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
}

#[derive(Clone, Debug, Serialize)]
pub struct SyntheticAnimalReceipt {
    pub schema: &'static str,
    pub event_id: Uuid,
    pub origin: &'static str,
    pub signal: SyntheticAnimalSignal,
    pub measurement: Value,
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
        }
    }
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
        signal.validate()?;
        let measurement = match &signal {
            SyntheticAnimalSignal::Compass { goal, current } => {
                serde_json::to_value(self.senses.navigate(goal, current))
            }
            SyntheticAnimalSignal::ActiveElectroreception { impedance_samples } => {
                serde_json::to_value(self.senses.electrolocate(impedance_samples))
            }
            SyntheticAnimalSignal::PassiveElectroreception { ambient_uv } => {
                serde_json::to_value(self.senses.passive_scan(ambient_uv))
            }
            SyntheticAnimalSignal::Vomeronasal { signal } => {
                serde_json::to_value(self.olfaction.receive_signal(signal.clone()))
            }
            SyntheticAnimalSignal::ThermalFusion { visual_nodes, thermal_readings } => {
                serde_json::to_value(self.senses.fuse_thermal(visual_nodes, thermal_readings))
            }
            SyntheticAnimalSignal::Echolocation { bandwidth_khz, duration_ms, echoes } => {
                let pulse = self.echolocation.emit_chirp(*bandwidth_khz, *duration_ms);
                serde_json::to_value(self.echolocation.process_echoes(&pulse, echoes))
            }
        }
        .map_err(|error| format!("sensor measurement serialization failed: {error}"))?;
        let payload = serde_json::json!({ "schema": "genos.synthetic-animal-signal/v1", "origin": "synthetic", "signal": &signal, "measurement": &measurement });
        let event_id = self.record_event("SYNTHETIC_ANIMAL_SIGNAL", payload);
        Ok(SyntheticAnimalReceipt {
            schema: "genos.synthetic-animal-receipt/v1",
            event_id,
            origin: "synthetic",
            signal,
            measurement,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{GenosEcosystem, SyntheticAnimalSignal};
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
}
