use crate::GenosEcosystem;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "sensor", rename_all = "snake_case")]
pub enum SyntheticAnimalSignal {
    Compass { goal: Vec<f64>, current: Vec<f64> },
    ActiveElectroreception { impedance_samples: Vec<f64> },
    PassiveElectroreception { ambient_uv: Vec<f64> },
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
    fn validate(&self) -> Result<(), String> {
        let samples = match self {
            Self::Compass { goal, current } => {
                if goal.len() != current.len() || goal.len() < 2 {
                    return Err("compass vectors must have equal dimensions of at least two".into());
                }
                goal.iter().chain(current).collect::<Vec<_>>()
            }
            Self::ActiveElectroreception { impedance_samples } => impedance_samples.iter().collect(),
            Self::PassiveElectroreception { ambient_uv } => ambient_uv.iter().collect(),
        };
        if samples.is_empty() || samples.len() > 4096 || samples.iter().any(|value| !value.is_finite()) {
            return Err("synthetic sensor samples must be finite and bounded to 4096 values".into());
        }
        Ok(())
    }
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
}
