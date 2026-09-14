use serde::{Deserialize, Serialize};

use super::sign_stimulus::{Modality, SignStimulus, StimulusField};

/// État hormonal et neurochimique modulant le seuil instinctif.
///
/// Les hormones ne réécrivent jamais le câblage du PAF : elles déplacent le
/// seuil de déclenchement (`threshold_modifier`) et le gain d'exécution
/// (`execution_gain`). La dopamine renforce la ré-exécution via la
/// récompense, sans créer de liaison synaptique.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct HormoneState {
    pub oxytocin: f64,
    pub prolactin: f64,
    pub testosterone: f64,
    pub cortisol: f64,
    pub dopamine: f64,
}

impl HormoneState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Modificateur multiplicatif du seuil : ocytocine/prolactine l'abaissent,
    /// testostérone/cortisol le relèvent. Borné dans [0.1, 1.5].
    pub fn threshold_modifier(&self) -> f64 {
        let lowering = 0.5 * self.oxytocin.clamp(0.0, 1.0) + 0.35 * self.prolactin.clamp(0.0, 1.0);
        let raising =
            0.4 * self.testosterone.clamp(0.0, 1.0) + 0.4 * self.cortisol.clamp(0.0, 1.0);
        (1.0 - lowering + raising).clamp(0.1, 1.5)
    }

    /// Gain d'exécution dopaminergique dans [1.0, 1.5].
    pub fn execution_gain(&self) -> f64 {
        1.0 + (0.5 * self.dopamine.clamp(0.0, 1.0) * 1000.0).round() / 1000.0
    }
}

/// Verdict d'évaluation d'un mécanisme déclencheur inné.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TriggerEvaluation {
    pub modality: Modality,
    pub signature: String,
    pub salience: f64,
    pub threshold: f64,
    pub released: bool,
    pub execution_gain: f64,
}

/// Mécanisme déclencheur inné (IRM) : compare la saillance d'un champ de
/// stimuli signes à un seuil modulé par l'état interne.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InnateReleasingMechanism {
    pub expected: SignStimulus,
    pub base_threshold: f64,
    pub sensitivity_gain: f64,
}

impl InnateReleasingMechanism {
    pub fn new(modality: Modality, signature: &str, base_threshold: f64) -> Self {
        Self {
            expected: SignStimulus::new(modality, signature, 1.0),
            base_threshold: base_threshold.clamp(0.0, 1.0),
            sensitivity_gain: 1.0,
        }
    }

    pub fn with_gain(mut self, gain: f64) -> Self {
        self.sensitivity_gain = gain.max(0.01);
        self
    }

    /// Seuil effectif : seuil de base modulé par les hormones et la sensibilité.
    pub fn effective_threshold(&self, hormones: &HormoneState) -> f64 {
        let raw = self.base_threshold * hormones.threshold_modifier() / self.sensitivity_gain;
        (raw.clamp(0.0, 1.0) * 1000.0).round() / 1000.0
    }

    pub fn evaluate(&self, field: &StimulusField, hormones: &HormoneState) -> TriggerEvaluation {
        let salience = field.salience_for(&self.expected);
        let threshold = self.effective_threshold(hormones);
        let released = threshold > 0.0 && salience >= threshold;
        TriggerEvaluation {
            modality: self.expected.modality,
            signature: self.expected.signature.clone(),
            salience,
            threshold,
            released,
            execution_gain: hormones.execution_gain(),
        }
    }
}
