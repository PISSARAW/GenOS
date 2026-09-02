use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 1. LA COUVERTURE DE MARKOV (Markov Blanket)
/// Sépare statistiquement l'agent de son environnement.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MarkovBlanket {
    pub hidden_states: String,   // Le monde réel inatteignable (ex: OS hôte)
    pub sensory_states: String,  // Les inputs perçus (stdout, stderr)
    pub active_states: String,   // Les actions émises (tool calls)
    pub internal_states: String, // Le modèle génératif de l'agent
}

impl Default for MarkovBlanket {
    fn default() -> Self {
        Self {
            hidden_states: "OS_Environment".to_string(),
            sensory_states: String::new(),
            active_states: String::new(),
            internal_states: "Generative_Model".to_string(),
        }
    }
}

/// 2. ÉNERGIE LIBRE ATTENDUE (Expected Free Energy - EFE)
/// L'agent choisit ses actions pour minimiser cette quantité.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExpectedFreeEnergy {
    pub pragmatic_value: f32, // Exploitation (Atteindre le but)
    pub epistemic_value: f32, // Exploration (Réduire l'incertitude)
}

impl ExpectedFreeEnergy {
    pub fn new() -> Self {
        Self { pragmatic_value: 0.0, epistemic_value: 0.0 }
    }

    pub fn calculate_efe(&self) -> f32 {
        // On cherche à minimiser l'EFE, donc une valeur épistémique haute (réduit l'EFE).
        // Plus on a d'information (epistemic) et de succès (pragmatic), plus l'énergie libre baisse.
        - (self.pragmatic_value + self.epistemic_value)
    }
}

/// 3. LE CODAGE PRÉDICTIF ET PONDÉRATION DE PRÉCISION
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PredictiveCoding {
    pub expected_outcome: Option<String>,
    pub prediction_error: f32, 
    pub precision_weight: f32, // (Dopamine/Neuromodulateurs) Confiance dans l'erreur
}

impl PredictiveCoding {
    pub fn new() -> Self {
        Self { expected_outcome: None, prediction_error: 0.0, precision_weight: 1.0 }
    }

    pub fn set_prediction(&mut self, outcome: &str) {
        self.expected_outcome = Some(outcome.to_string());
    }

    pub fn calculate_weighted_error(&mut self, actual_outcome: &str) -> f32 {
        if let Some(expected) = &self.expected_outcome {
            if !actual_outcome.contains(expected) {
                self.prediction_error = 1.0;
            } else {
                self.prediction_error = 0.0;
            }
        }
        self.prediction_error * self.precision_weight
    }
}

/// 4. PATHOLOGIES DE L'INFÉRENCE ACTIVE (Psychiatrie Computationnelle)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComputationalPsychiatry {
    pub schizophrenia_spectrum: bool, // Sur-pondération du bruit interne (Hallucinations)
    pub autism_spectrum: bool,        // Sur-pondération des erreurs externes (Stéréotypies)
}

impl Default for ComputationalPsychiatry {
    fn default() -> Self {
        Self { schizophrenia_spectrum: false, autism_spectrum: false }
    }
}

/// 5. LE CORTEX PRÉFRONTAL (Maintien du But Hiérarchique)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrefrontalCortex {
    pub absolute_goal: String,
    pub drift_detected: bool,
}

impl PrefrontalCortex {
    pub fn new(goal: &str) -> Self {
        Self {
            absolute_goal: goal.to_string(),
            drift_detected: false,
        }
    }
}

/// 6. PLASTICITÉ SYNAPTIQUE (Apprentissage)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SynapticPlasticity {
    pub tool_weights: HashMap<String, f32>,
}

impl SynapticPlasticity {
    pub fn new() -> Self { Self::default() }
    pub fn reinforce_tool(&mut self, tool_name: &str) {
        *self.tool_weights.entry(tool_name.to_string()).or_insert(1.0) += 0.1;
    }
    pub fn depress_tool(&mut self, tool_name: &str) {
        let weight = self.tool_weights.entry(tool_name.to_string()).or_insert(1.0);
        *weight = (*weight - 0.2).max(0.1);
    }
}

/// 7. STOCHASTICITÉ MÉTABOLIQUE
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetabolicStress {
    pub stress_level: f32,
}
impl MetabolicStress {
    pub fn new() -> Self { Self { stress_level: 0.0 } }
    pub fn increase(&mut self) { self.stress_level = (self.stress_level + 0.2).min(1.0); }
    pub fn relax(&mut self) { self.stress_level = 0.0; }
}

/// L'ORGANE COGNITIF GLOBAL : Principe d'Énergie Libre
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdvancedCognition {
    pub pfc: PrefrontalCortex,
    pub markov_blanket: MarkovBlanket,
    pub predictive_coding: PredictiveCoding,
    pub efe: ExpectedFreeEnergy,
    pub pathology: ComputationalPsychiatry,
    pub plasticity: SynapticPlasticity,
    pub stress: MetabolicStress,
}

impl Default for AdvancedCognition {
    fn default() -> Self { Self::new("SURVIVRE ET EXECUTER LE PROMPT INITIAL") }
}

impl AdvancedCognition {
    pub fn new(goal: &str) -> Self {
        Self {
            pfc: PrefrontalCortex::new(goal),
            markov_blanket: MarkovBlanket::default(),
            predictive_coding: PredictiveCoding::new(),
            efe: ExpectedFreeEnergy::new(),
            pathology: ComputationalPsychiatry::default(),
            plasticity: SynapticPlasticity::new(),
            stress: MetabolicStress::new(),
        }
    }

    /// Cycle d'Inférence Active
    pub fn active_inference_cycle(&mut self, action_name: &str, prediction: &str, actual_feedback: &str) -> Result<String, String> {
        self.markov_blanket.active_states = action_name.to_string();
        self.markov_blanket.sensory_states = actual_feedback.to_string();
        
        self.predictive_coding.set_prediction(prediction);

        // Pathologies : Altération de la pondération de précision
        if self.pathology.schizophrenia_spectrum {
            // L'agent attribue une énorme précision à ses prédictions internes, ignorant la réalité.
            self.predictive_coding.precision_weight = 0.0; 
            // Hallucination : Il fabrique un faux retour sensoriel pour correspondre à sa prédiction.
            self.markov_blanket.sensory_states = prediction.to_string();
        } else if self.pathology.autism_spectrum {
            // Sur-ajustement aux détails sensoriels : La moindre erreur de bas niveau est fatale
            self.predictive_coding.precision_weight = 5.0; 
        } else {
            self.predictive_coding.precision_weight = 1.0;
        }

        // Calcul de l'Erreur de Prédiction (Surprise)
        let error = self.predictive_coding.calculate_weighted_error(&self.markov_blanket.sensory_states);

        if error > 0.5 {
            // ÉCHEC / SURPRISE ÉLEVÉE
            self.stress.increase();
            self.plasticity.depress_tool(action_name);
            
            if self.pathology.autism_spectrum {
                return Err("🔄 [STÉRÉOTYPIE] Sur-ajustement autistique. L'agent boucle sur une action familière pour réduire l'incertitude.".to_string());
            }

            self.pfc.drift_detected = true;
            Err(format!("⚠️ [ÉNERGIE LIBRE ÉLEVÉE] Erreur de prédiction : {}. Stress : {}", error, self.stress.stress_level))
        } else {
            // SUCCÈS / MINIMISATION DE L'ÉNERGIE LIBRE
            self.stress.relax();
            self.plasticity.reinforce_tool(action_name);
            
            if self.pathology.schizophrenia_spectrum {
                return Ok("👁️ [HALLUCINATION SCHIZOPHRÉNIQUE] L'agent a perçu sa prédiction au lieu de la réalité.".to_string());
            }

            Ok("✅ [INFÉRENCE ACTIVE] Énergie libre minimisée. Modèle génératif validé.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_active_inference_anti_drift() {
        let mut cognition = AdvancedCognition::new("Serveur web");

        // 1. Cycle normal réussi
        let success = cognition.active_inference_cycle("Ecrire_Fichier", "OK", "Le fichier a été créé (OK)");
        assert!(success.is_ok());

        // 2. Erreur = Montée de l'énergie libre
        let failure = cognition.active_inference_cycle("Compiler", "Réussite", "Error");
        assert!(failure.is_err());
        assert!(cognition.stress.stress_level > 0.0);
    }

    #[test]
    fn test_schizophrenia_hallucination() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        cognition.pathology.schizophrenia_spectrum = true;

        // Même avec une erreur fatale, l'agent hallucine la réussite
        let result = cognition.active_inference_cycle("Compiler", "Réussite", "FATAL ERROR");
        assert!(result.is_ok());
        assert!(result.unwrap().contains("HALLUCINATION"));
    }

    #[test]
    fn test_autism_stereotypy() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        cognition.pathology.autism_spectrum = true;

        // Une petite erreur déclenche une crise de précision (Overfitting)
        let result = cognition.active_inference_cycle("Compiler", "Réussite", "Warning");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("STÉRÉOTYPIE"));
    }
}
