use serde::{Deserialize, Serialize};

/// Modalité sensorielle porteuse d'un stimulus signe.
///
/// Chaque modalité correspond à un canal déjà modélisé dans
/// `crates/genos-biology/src/sensory` : phéromone (VNO), thermique
/// (tectum), magnétique (cluster N), acoustique (écholocation),
/// visuel (fovéation) ou signal d'erreur/dissonance.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Modality {
    Pheromone,
    Thermal,
    Magnetic,
    Acoustic,
    Visual,
    Error,
}

impl Modality {
    pub fn as_str(self) -> &'static str {
        match self {
            Modality::Pheromone => "pheromone",
            Modality::Thermal => "thermal",
            Modality::Magnetic => "magnetic",
            Modality::Acoustic => "acoustic",
            Modality::Visual => "visual",
            Modality::Error => "error",
        }
    }

    /// Analyse souple d'une modalité textuelle (défaut : phéromone).
    pub fn parse(value: &str) -> Modality {
        match value.trim().to_lowercase().as_str() {
            "thermal" | "temperature" | "infrared" => Modality::Thermal,
            "magnetic" | "magnetoreception" => Modality::Magnetic,
            "acoustic" | "sound" | "echolocation" => Modality::Acoustic,
            "visual" | "vision" => Modality::Visual,
            "error" | "dissonance" => Modality::Error,
            _ => Modality::Pheromone,
        }
    }
}

/// Stimulus signe : une signature captée sur une modalité, pondérée par la
/// fiabilité du canal. Il est purement déclaratif et ne déclenche rien seul.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignStimulus {
    pub modality: Modality,
    pub signature: String,
    pub intensity: f64,
    pub weight: f64,
}

impl SignStimulus {
    pub fn new(modality: Modality, signature: &str, intensity: f64) -> Self {
        Self {
            modality,
            signature: signature.to_string(),
            intensity,
            weight: 1.0,
        }
    }

    pub fn with_weight(mut self, weight: f64) -> Self {
        self.weight = weight;
        self
    }

    /// Contribution normalisée : fiabilité x intensité bornée, arrondie au millième.
    pub fn contribution(&self) -> f64 {
        let raw = self.weight.clamp(0.0, 1.0) * self.intensity.clamp(0.0, 1.0);
        (raw * 1000.0).round() / 1000.0
    }

    /// Vrai si la modalité et la signature correspondent au stimulus attendu.
    pub fn matches(&self, expected: &SignStimulus) -> bool {
        self.modality == expected.modality
            && self.signature.eq_ignore_ascii_case(&expected.signature)
    }
}

/// Champ de stimuli captés par les capteurs d'un agent à un instant donné.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct StimulusField {
    pub readings: Vec<SignStimulus>,
}

impl StimulusField {
    pub fn new() -> Self {
        Self {
            readings: Vec::new(),
        }
    }

    pub fn push(mut self, stimulus: SignStimulus) -> Self {
        self.readings.push(stimulus);
        self
    }

    /// Saillance cumulée des seules lectures correspondant au stimulus attendu.
    pub fn salience_for(&self, expected: &SignStimulus) -> f64 {
        let mut total = 0.0;
        for reading in &self.readings {
            if reading.matches(expected) {
                total += reading.contribution();
            }
        }
        (total.clamp(0.0, 1.0) * 1000.0).round() / 1000.0
    }

    /// Saillance globale du champ, toutes modalités confondues.
    pub fn salience(&self) -> f64 {
        let mut total = 0.0;
        for reading in &self.readings {
            total += reading.contribution();
        }
        (total.clamp(0.0, 1.0) * 1000.0).round() / 1000.0
    }
}
