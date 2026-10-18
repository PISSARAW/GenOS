use serde::{Deserialize, Serialize};

/// Modalité sensorielle perçue.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum SensorModality {
    Chemical,
    Thermal,
    Luminal,
    Mechanical,
    Electrical,
    Magnetic,
    Acoustic,
    Polarized,
}

/// État du sensorium après évaluation.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum SensoriumState {
    Nominal,
    Alert,
    Critical,
}

/// Seuil de perception pour une modalité donnée.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SensorThreshold {
    pub modality: SensorModality,
    pub threshold: f64,
    pub current: f64,
}

/// Signal sensoriel brut capté par l'organisme.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Signal {
    pub modality: SensorModality,
    pub intensity: f64,
    pub timestamp: Option<u64>,
}

/// Provenance minimale d'une observation sensorielle intégrée.
/// Les adaptateurs synthétiques restent explicitement marqués et ne peuvent
/// pas être confondus avec une mesure matérielle.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SignalProvenance {
    pub source_id: String,
    pub capture_id: String,
    pub observed_at_epoch_ms: u64,
    pub synthetic: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SensoriumObservation {
    pub signal: Signal,
    pub provenance: SignalProvenance,
}

/// Ensemble des seuils et signaux du sensorium.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Sensorium {
    pub thresholds: Vec<SensorThreshold>,
    pub signals: Vec<Signal>,
    pub observations: Vec<SensoriumObservation>,
}

impl Default for Sensorium {
    fn default() -> Self {
        Self {
            thresholds: Vec::new(),
            signals: Vec::new(),
            observations: Vec::new(),
        }
    }
}

/// Intègre un signal brut dans le sensorium (mise à jour de la valeur courante).
pub fn integrate_signal(sensorium: &mut Sensorium, signal: Signal) {
    let exists = sensorium
        .thresholds
        .iter_mut()
        .find(|t| t.modality == signal.modality);
    if let Some(threshold) = exists {
        threshold.current = signal.intensity;
    } else {
        sensorium.thresholds.push(SensorThreshold {
            modality: signal.modality.clone(),
            threshold: 1.0,
            current: signal.intensity,
        });
    }
    sensorium.signals.push(signal);
}

/// Intègre une lecture et conserve la preuve de sa provenance.
pub fn integrate_verified_signal(
    sensorium: &mut Sensorium,
    signal: Signal,
    provenance: SignalProvenance,
) {
    integrate_signal(sensorium, signal.clone());
    sensorium
        .observations
        .push(SensoriumObservation { signal, provenance });
}

/// Évalue l'état global du sensorium à partir des seuils courants.
pub fn evaluate(sensorium: &Sensorium) -> SensoriumState {
    let mut exceeded = 0;
    let mut critical = 0;
    for threshold in &sensorium.thresholds {
        if threshold.current > threshold.threshold {
            exceeded += 1;
        }
        if threshold.current > 2.0 * threshold.threshold {
            critical += 1;
        }
    }
    if critical > 0 {
        SensoriumState::Critical
    } else if exceeded > 0 {
        SensoriumState::Alert
    } else {
        SensoriumState::Nominal
    }
}

/// Vérifie si une modalité donnée dépasse son seuil.
pub fn is_exceeded(sensorium: &Sensorium, modality: SensorModality) -> bool {
    sensorium
        .thresholds
        .iter()
        .find(|t| t.modality == modality)
        .map(|t| t.current > t.threshold)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nominal_when_all_below_threshold() {
        let mut s = Sensorium::default();
        integrate_signal(
            &mut s,
            Signal {
                modality: SensorModality::Chemical,
                intensity: 0.3,
                timestamp: None,
            },
        );
        assert_eq!(evaluate(&s), SensoriumState::Nominal);
    }

    #[test]
    fn alert_when_threshold_exceeded() {
        let mut s = Sensorium::default();
        s.thresholds.push(SensorThreshold {
            modality: SensorModality::Thermal,
            threshold: 0.5,
            current: 0.8,
        });
        assert_eq!(evaluate(&s), SensoriumState::Alert);
        assert!(is_exceeded(&s, SensorModality::Thermal));
    }

    #[test]
    fn critical_when_double_threshold_exceeded() {
        let mut s = Sensorium::default();
        s.thresholds.push(SensorThreshold {
            modality: SensorModality::Luminal,
            threshold: 0.5,
            current: 1.2,
        });
        assert_eq!(evaluate(&s), SensoriumState::Critical);
    }

    #[test]
    fn unknown_modality_is_not_exceeded() {
        let s = Sensorium::default();
        assert!(!is_exceeded(&s, SensorModality::Electrical));
    }

    #[test]
    fn verified_observation_keeps_provenance_and_modality() {
        let mut s = Sensorium::default();
        integrate_verified_signal(
            &mut s,
            Signal {
                modality: SensorModality::Magnetic,
                intensity: 0.8,
                timestamp: Some(42),
            },
            SignalProvenance {
                source_id: "synthetic-adapter".into(),
                capture_id: "capture-1".into(),
                observed_at_epoch_ms: 42,
                synthetic: true,
            },
        );
        assert_eq!(s.observations.len(), 1);
        assert!(s.observations[0].provenance.synthetic);
        assert_eq!(s.observations[0].signal.modality, SensorModality::Magnetic);
    }
}
